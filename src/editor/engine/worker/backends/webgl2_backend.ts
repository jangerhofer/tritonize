import type { Operation } from '@/editor/types/domain'
import type { RendererBackend, RenderExportInput, RenderPreviewInput } from './backend'
import {
  applyCanvasOperation,
  bitmapToBlob,
  fitBitmap,
  makeStats,
  operationIsTritonizer,
} from '@/editor/engine/worker/pipeline'

interface TritonizerParams {
  readonly colors: readonly (readonly [number, number, number])[]
  readonly sigmoidMidpoint: number
  readonly sigmoidStrength: number
}

// Values passed directly to the Tritonizer shader.
interface WebGLUniforms {
  readonly image: WebGLUniformLocation
  readonly colorCount: WebGLUniformLocation
  readonly sigmoidMidpoint: WebGLUniformLocation
  readonly sigmoidStrength: WebGLUniformLocation
  readonly colors: WebGLUniformLocation
}

interface WebGLState {
  readonly gl: WebGL2RenderingContext
  readonly program: WebGLProgram
  readonly vertexBuffer: WebGLBuffer
  readonly positionLocation: number
  readonly texCoordLocation: number
  readonly uniforms: WebGLUniforms
}

const VERTEX_SHADER_SOURCE = `
  attribute vec2 a_position;
  attribute vec2 a_texCoord;
  varying vec2 v_texCoord;

  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_texCoord = a_texCoord;
  }
`

const FRAGMENT_SHADER_SOURCE = `
  precision mediump float;

  uniform sampler2D u_image;
  uniform vec3 u_colors[16];
  uniform int u_colorCount;
  uniform float u_sigmoidMidpoint;
  uniform float u_sigmoidStrength;
  varying vec2 v_texCoord;

  float sigmoid(float x, float midpoint, float strength) {
    return 1.0 / (1.0 + exp(-((x - midpoint) / max(0.01, strength))));
  }

  void main() {
    vec4 color = texture2D(u_image, v_texCoord);
    float gray = color.r * 0.299 + color.g * 0.587 + color.b * 0.114;
    float threshold = sigmoid(gray, u_sigmoidMidpoint, u_sigmoidStrength * 0.125);

    float indexFloat = floor(threshold * float(u_colorCount));
    int index = int(indexFloat);
    if (index >= u_colorCount) {
      index = u_colorCount - 1;
    }

    vec3 mapped = u_colors[0];
    for (int i = 0; i < 16; i++) {
      if (i == index) {
        mapped = u_colors[i];
        break;
      }
    }

    gl_FragColor = vec4(mapped, 1.0);
  }
`

// Interleaved fullscreen quad (position + UV) for fragment-only processing.
const QUAD_POSITION_BUFFER = new Float32Array([
  -1,
  -1,
  0,
  1,
  1,
  -1,
  1,
  1,
  -1,
  1,
  0,
  0,
  1,
  1,
  1,
  0,
])

function createShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string
): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) {
    throw new Error('Failed to create shader')
  }

  gl.shaderSource(shader, source)
  gl.compileShader(shader)

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(`Shader compile error: ${gl.getShaderInfoLog(shader)}`)
  }

  return shader
}

// Compile both stages, link once, and fail early if either compile/link stage breaks.
function createProgram(
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string
): WebGLProgram {
  const vertex = createShader(gl, gl.VERTEX_SHADER, vertexSource)
  const fragment = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource)

  const program = gl.createProgram()
  if (!program) {
    throw new Error('Failed to create program')
  }

  gl.attachShader(program, vertex)
  gl.attachShader(program, fragment)
  gl.linkProgram(program)

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`Program link error: ${gl.getProgramInfoLog(program)}`)
  }

  gl.deleteShader(vertex)
  gl.deleteShader(fragment)

  return program
}

// Build long-lived WebGL state (program + buffers + attribute/uniform locations).
// Returns null when the GPU path is unavailable so callers can downshift to CPU.
function createState(canvas: OffscreenCanvas): WebGLState | null {
  const gl = canvas.getContext('webgl2', {
    antialias: false,
    alpha: false,
    preserveDrawingBuffer: false,
  })

  if (!gl) {
    return null
  }

  const program = createProgram(gl, VERTEX_SHADER_SOURCE, FRAGMENT_SHADER_SOURCE)

  const positionLocation = gl.getAttribLocation(program, 'a_position')
  const texCoordLocation = gl.getAttribLocation(program, 'a_texCoord')
  const imageLocation = gl.getUniformLocation(program, 'u_image')
  const colorCountLocation = gl.getUniformLocation(program, 'u_colorCount')
  const sigmoidMidpointLocation = gl.getUniformLocation(program, 'u_sigmoidMidpoint')
  const sigmoidStrengthLocation = gl.getUniformLocation(program, 'u_sigmoidStrength')
  const colorsLocation = gl.getUniformLocation(program, 'u_colors')

  if (
    positionLocation < 0 ||
    texCoordLocation < 0 ||
    imageLocation === null ||
    colorCountLocation === null ||
    sigmoidMidpointLocation === null ||
    sigmoidStrengthLocation === null ||
    colorsLocation === null
  ) {
    gl.deleteProgram(program)
    return null
  }

  const vertexBuffer = gl.createBuffer()
  if (!vertexBuffer) {
    gl.deleteProgram(program)
    return null
  }

  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, QUAD_POSITION_BUFFER, gl.STATIC_DRAW)

  return {
    gl,
    program,
    vertexBuffer,
    positionLocation,
    texCoordLocation,
    uniforms: {
      image: imageLocation,
      colorCount: colorCountLocation,
      sigmoidMidpoint: sigmoidMidpointLocation,
      sigmoidStrength: sigmoidStrengthLocation,
      colors: colorsLocation,
    },
  }
}

function withWebGLFallback(
  source: ImageBitmap,
  params: TritonizerParams,
  state: WebGLState | null
): ImageBitmap {
  // If the backend could not initialize GPU state, execute on CPU immediately.
  if (!state) {
    return applyCanvasOperation(source, {
      type: 'tritonizer',
      params,
    })
  }

  const {
    gl,
    program,
    vertexBuffer,
    positionLocation,
    texCoordLocation,
    uniforms,
  } = state
  let texture: WebGLTexture | null = null

  // Clamp source dimensions and palette size to backend limits.
  const width = Math.max(1, source.width)
  const height = Math.max(1, source.height)
  const colorCount = Math.min(params.colors.length, 16)
  if (colorCount <= 0) {
    return applyCanvasOperation(source, {
      type: 'tritonizer',
      params,
    })
  }

  try {
    const canvas = gl.canvas as OffscreenCanvas
    // Stage 1: match output buffer to input dimensions and bind viewport.
    canvas.width = width
    canvas.height = height
    gl.viewport(0, 0, width, height)
    gl.useProgram(program)

    // Stage 2: bind fullscreen geometry stream for the draw pass.
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer)
    gl.enableVertexAttribArray(positionLocation)
    gl.enableVertexAttribArray(texCoordLocation)
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 16, 0)
    gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 16, 8)

    // Allocate one transient texture for this draw call.
    texture = gl.createTexture()
    if (!texture) {
      return applyCanvasOperation(source, {
        type: 'tritonizer',
        params,
      })
    }

    // Stage 3: upload source image as input texture.
    gl.bindTexture(gl.TEXTURE_2D, texture)

    // Clamp edges and use linear sampling to match existing preview scaling behavior.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    // Upload the source bitmap into GPU texture memory.
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)

    // Stage 4: push operation parameters/palette to shader uniforms.
    // Sampler binding maps u_image to texture unit 0.
    gl.uniform1i(uniforms.image, 0)
    // Scalar control values shape the sigmoid partitioning and output quantization.
    gl.uniform1i(uniforms.colorCount, colorCount)
    gl.uniform1f(uniforms.sigmoidMidpoint, params.sigmoidMidpoint)
    gl.uniform1f(uniforms.sigmoidStrength, params.sigmoidStrength)

    // Pack palette entries as normalized floats into fixed-size vec3 array.
    const colorArray = new Float32Array(16 * 3)
    for (let i = 0; i < colorCount; i += 1) {
      const color = params.colors[i]
      if (!color) {
        continue
      }

      colorArray[i * 3] = color[0] / 255
      colorArray[i * 3 + 1] = color[1] / 255
      colorArray[i * 3 + 2] = color[2] / 255
    }

    // Stage 5: emit the fragment shader full-frame pass.
    gl.uniform3fv(uniforms.colors, colorArray)
    // Four-vertex strip spans clip space and invokes one fragment pass for the whole image.
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

    return canvas.transferToImageBitmap()
  } catch {
    // Any GL failure falls back to CPU to keep behavior deterministic.
    return applyCanvasOperation(source, {
      type: 'tritonizer',
      params,
    })
  } finally {
    // Ensure transient texture is cleaned up even when returning via fallback/error.
    if (texture) {
      gl.deleteTexture(texture)
    }
  }
}

function applyOperations(
  source: ImageBitmap,
  operations: readonly Operation[],
  isCancelled: () => boolean,
  state: WebGLState | null
): ImageBitmap {
  let current = source

  for (const operation of operations) {
    if (isCancelled()) {
      break
    }

    // Tritonizer uses the GPU path; non-tritonizer ops currently use canvas fallback.
    const next = operationIsTritonizer(operation)
      ? withWebGLFallback(current, operation.params, state)
      : applyCanvasOperation(current, operation)

    if (current !== source) {
      current.close()
    }

    current = next
  }

  return current
}

export class WebGL2Backend implements RendererBackend {
  readonly name = 'webgl2' as const
  private readonly state: WebGLState | null
  private readonly canvas: OffscreenCanvas
  private queue = Promise.resolve()

  constructor() {
    this.canvas = new OffscreenCanvas(1, 1)
    // Single reusable context/state for the editor lifetime.
    this.state = createState(this.canvas)
  }

  // Serialize GPU work so commands never run concurrently against one shared context.
  private withLock<T>(task: () => Promise<T> | T): Promise<T> {
    const next = this.queue.then(() => task())
    this.queue = next.then(
      () => undefined,
      () => undefined
    )
    return next
  }

  async renderPreview(input: RenderPreviewInput) {
    // Apply all operations first, then downscale/pad result to requested viewport.
    const startedAt = performance.now()
    const fitted = await this.withLock(async () => {
      const rendered = applyOperations(
        input.source,
        input.operations,
        input.cancelToken.isCancelled,
        this.state
      )
      const next = fitBitmap(rendered, input.targetWidth, input.targetHeight)

      if (rendered !== input.source) {
        rendered.close()
      }

      return next
    })

    const elapsedMs = performance.now() - startedAt
    return {
      bitmap: fitted,
      stats: makeStats(elapsedMs, fitted.width, fitted.height, this.name),
    }
  }

  async renderExport(input: RenderExportInput) {
    // Export renders from the operation chain at source quality, then encodes.
    const startedAt = performance.now()
    const result = await this.withLock(async () => {
      const rendered = applyOperations(
        input.source,
        input.operations,
        input.cancelToken.isCancelled,
        this.state
      )
      const blob = await bitmapToBlob(rendered, input.exportOptions)

      if (rendered !== input.source) {
        rendered.close()
      }

      return {
        blob,
        width: input.source.width,
        height: input.source.height,
      }
    })

    return {
      blob: result.blob,
      stats: makeStats(
        performance.now() - startedAt,
        result.width,
        result.height,
        this.name
      ),
    }
  }

  dispose(): void {
    // Cleanly release GPU state at teardown to avoid lingering WebGL context pressure.
    if (!this.state) {
      return
    }

    this.state.gl.deleteProgram(this.state.program)
    this.state.gl.deleteBuffer(this.state.vertexBuffer)
    const loseContext = this.state.gl.getExtension('WEBGL_lose_context')
    if (loseContext) {
      loseContext.loseContext()
    }
    this.queue = Promise.resolve()
  }

  getCanvas(): OffscreenCanvas {
    return this.canvas
  }
}
