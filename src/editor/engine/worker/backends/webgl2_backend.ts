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

function applyTritonizerWebGL(
  source: ImageBitmap,
  params: TritonizerParams
): ImageBitmap {
  const canvas = new OffscreenCanvas(source.width, source.height)
  const gl = canvas.getContext('webgl2', {
    antialias: false,
    alpha: false,
    preserveDrawingBuffer: false,
  })

  if (!gl) {
    return applyCanvasOperation(source, {
      type: 'tritonizer',
      params,
    })
  }

  const vertexSource = `
    attribute vec2 a_position;
    attribute vec2 a_texCoord;
    varying vec2 v_texCoord;
    void main() {
      gl_Position = vec4(a_position, 0.0, 1.0);
      v_texCoord = a_texCoord;
    }
  `

  const fragmentSource = `
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

  const program = createProgram(gl, vertexSource, fragmentSource)
  gl.useProgram(program)

  const positions = new Float32Array([
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

  const buffer = gl.createBuffer()
  if (!buffer) {
    throw new Error('Failed to create buffer')
  }

  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW)

  const positionLoc = gl.getAttribLocation(program, 'a_position')
  const texCoordLoc = gl.getAttribLocation(program, 'a_texCoord')
  gl.enableVertexAttribArray(positionLoc)
  gl.enableVertexAttribArray(texCoordLoc)
  gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 16, 0)
  gl.vertexAttribPointer(texCoordLoc, 2, gl.FLOAT, false, 16, 8)

  const texture = gl.createTexture()
  if (!texture) {
    throw new Error('Failed to create texture')
  }

  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    source
  )

  gl.uniform1i(gl.getUniformLocation(program, 'u_image'), 0)
  gl.uniform1i(
    gl.getUniformLocation(program, 'u_colorCount'),
    Math.min(params.colors.length, 16)
  )
  gl.uniform1f(
    gl.getUniformLocation(program, 'u_sigmoidMidpoint'),
    params.sigmoidMidpoint
  )
  gl.uniform1f(
    gl.getUniformLocation(program, 'u_sigmoidStrength'),
    params.sigmoidStrength
  )

  const colorArray = new Float32Array(16 * 3)
  for (let i = 0; i < Math.min(params.colors.length, 16); i++) {
    const color = params.colors[i]
    if (!color) {
      continue
    }
    colorArray[i * 3] = color[0] / 255
    colorArray[i * 3 + 1] = color[1] / 255
    colorArray[i * 3 + 2] = color[2] / 255
  }

  gl.uniform3fv(gl.getUniformLocation(program, 'u_colors'), colorArray)
  gl.viewport(0, 0, source.width, source.height)
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

  gl.deleteBuffer(buffer)
  gl.deleteTexture(texture)
  gl.deleteProgram(program)

  return canvas.transferToImageBitmap()
}

function applyOperations(
  source: ImageBitmap,
  operations: readonly Operation[],
  isCancelled: () => boolean
): ImageBitmap {
  let current = source

  for (const operation of operations) {
    if (isCancelled()) {
      break
    }

    const next = operationIsTritonizer(operation)
      ? applyTritonizerWebGL(current, operation.params)
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

  async renderPreview(input: RenderPreviewInput) {
    const startedAt = performance.now()
    const rendered = applyOperations(
      input.source,
      input.operations,
      input.cancelToken.isCancelled
    )
    const fitted = fitBitmap(rendered, input.targetWidth, input.targetHeight)

    if (rendered !== input.source) {
      rendered.close()
    }

    const elapsedMs = performance.now() - startedAt

    return {
      bitmap: fitted,
      stats: makeStats(elapsedMs, fitted.width, fitted.height, this.name),
    }
  }

  async renderExport(input: RenderExportInput) {
    const startedAt = performance.now()
    const rendered = applyOperations(
      input.source,
      input.operations,
      input.cancelToken.isCancelled
    )

    const blob = await bitmapToBlob(rendered, input.exportOptions)
    const elapsedMs = performance.now() - startedAt

    if (rendered !== input.source) {
      rendered.close()
    }

    return {
      blob,
      stats: makeStats(
        elapsedMs,
        input.source.width,
        input.source.height,
        this.name
      ),
    }
  }

  dispose(): void {
    // no-op
  }
}
