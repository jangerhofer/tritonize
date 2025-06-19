// Shared WebGL tritonizer instance
let shared_tritonizer: WebGLTritonizer | null = null

interface ShaderPrograms {
	program: WebGLProgram
	blur_program: WebGLProgram
}

export class WebGLTritonizer {
	private canvas_programs: WeakMap<HTMLCanvasElement, ShaderPrograms> =
		new WeakMap()

	constructor() {
		// Only create one instance
		if (shared_tritonizer) {
			return shared_tritonizer
		}
		shared_tritonizer = this
	}

	static getInstance(): WebGLTritonizer {
		if (!shared_tritonizer) {
			shared_tritonizer = new WebGLTritonizer()
		}
		return shared_tritonizer
	}

	init_shaders_for_canvas(
		canvas: HTMLCanvasElement,
		gl: WebGLRenderingContext
	): ShaderPrograms {
		// Check if we already have programs for this canvas
		const existing = this.canvas_programs.get(canvas)
		if (existing) {
			return existing
		}

		// Vertex shader for full-screen quad
		const vertex_shader_source = `
			attribute vec2 a_position;
			attribute vec2 a_texCoord;
			varying vec2 v_texCoord;
			
			void main() {
				gl_Position = vec4(a_position, 0.0, 1.0);
				v_texCoord = a_texCoord;
			}
		`

		// Fragment shader for tritonize effect
		const fragment_shader_source = `
			precision mediump float;
			
			uniform sampler2D u_image;
			uniform vec3 u_colors[16];
			uniform int u_colorCount;
			varying vec2 v_texCoord;
			
			float sigmoid(float x) {
				return 1.0 / (1.0 + exp(-((x - 0.5) / 0.125)));
			}
			
			void main() {
				vec4 color = texture2D(u_image, v_texCoord);
				
				// Convert to grayscale using luminance weights
				float grayscale = color.r * 0.299 + color.g * 0.587 + color.b * 0.114;
				
				// Apply sigmoid transformation
				float threshold = sigmoid(grayscale);
				
				// Map to color palette
				float colorIndexFloat = floor(threshold * float(u_colorCount));
				int colorIndex = int(colorIndexFloat);
				if (colorIndex >= u_colorCount) {
					colorIndex = u_colorCount - 1;
				}
				
				vec3 targetColor = u_colors[0];
				for (int i = 0; i < 16; i++) {
					if (i == colorIndex) {
						targetColor = u_colors[i];
						break;
					}
				}
				
				gl_FragColor = vec4(targetColor, 1.0);
			}
		`

		// Blur fragment shader
		const blur_fragment_shader_source = `
			precision mediump float;
			
			uniform sampler2D u_image;
			uniform vec2 u_resolution;
			uniform float u_blurAmount;
			varying vec2 v_texCoord;
			
			void main() {
				vec2 texelSize = 1.0 / u_resolution;
				vec4 color = vec4(0.0);
				float total = 0.0;
				
				float blurSize = u_blurAmount * 0.01;
				
				for (float x = -4.0; x <= 4.0; x++) {
					for (float y = -4.0; y <= 4.0; y++) {
						vec2 offset = vec2(x, y) * texelSize * blurSize;
						float weight = exp(-(x*x + y*y) / 8.0);
						color += texture2D(u_image, v_texCoord + offset) * weight;
						total += weight;
					}
				}
				
				gl_FragColor = color / total;
			}
		`

		const program = this.create_program(
			gl,
			vertex_shader_source,
			fragment_shader_source
		)
		const blur_program = this.create_program(
			gl,
			vertex_shader_source,
			blur_fragment_shader_source
		)
		this.setup_geometry(gl)

		// Store programs for this canvas
		const programs = { program, blur_program }
		this.canvas_programs.set(canvas, programs)
		return programs
	}

	create_shader(
		gl: WebGLRenderingContext,
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
			throw new Error(
				'Shader compile error: ' + gl.getShaderInfoLog(shader)
			)
		}

		return shader
	}

	create_program(
		gl: WebGLRenderingContext,
		vertex_source: string,
		fragment_source: string
	): WebGLProgram {
		const vertex_shader = this.create_shader(
			gl,
			gl.VERTEX_SHADER,
			vertex_source
		)
		const fragment_shader = this.create_shader(
			gl,
			gl.FRAGMENT_SHADER,
			fragment_source
		)

		const program = gl.createProgram()
		if (!program) {
			throw new Error('Failed to create program')
		}
		gl.attachShader(program, vertex_shader)
		gl.attachShader(program, fragment_shader)
		gl.linkProgram(program)

		if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
			throw new Error(
				'Program link error: ' + gl.getProgramInfoLog(program)
			)
		}

		return program
	}

	setup_geometry(gl: WebGLRenderingContext): void {
		const positions = new Float32Array([
			-1, -1, 0, 0, 1, -1, 1, 0, -1, 1, 0, 1, 1, 1, 1, 1,
		])

		const buffer = gl.createBuffer()
		if (!buffer) {
			throw new Error('Failed to create buffer')
		}
		gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
		gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW)
	}

	create_texture_for_canvas(
		gl: WebGLRenderingContext,
		image: HTMLImageElement
	): WebGLTexture {
		const texture = gl.createTexture()
		if (!texture) {
			throw new Error('Failed to create texture')
		}
		gl.bindTexture(gl.TEXTURE_2D, texture)
		gl.texImage2D(
			gl.TEXTURE_2D,
			0,
			gl.RGBA,
			gl.RGBA,
			gl.UNSIGNED_BYTE,
			image
		)
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
		return texture
	}

	setup_framebuffer_for_canvas(
		gl: WebGLRenderingContext,
		width: number,
		height: number
	): { framebuffer: WebGLFramebuffer; blur_texture: WebGLTexture } {
		const framebuffer = gl.createFramebuffer()
		if (!framebuffer) {
			throw new Error('Failed to create framebuffer')
		}
		const blur_texture = gl.createTexture()
		if (!blur_texture) {
			throw new Error('Failed to create blur texture')
		}

		gl.bindTexture(gl.TEXTURE_2D, blur_texture)
		gl.texImage2D(
			gl.TEXTURE_2D,
			0,
			gl.RGBA,
			width,
			height,
			0,
			gl.RGBA,
			gl.UNSIGNED_BYTE,
			null
		)
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)

		gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
		gl.framebufferTexture2D(
			gl.FRAMEBUFFER,
			gl.COLOR_ATTACHMENT0,
			gl.TEXTURE_2D,
			blur_texture,
			0
		)

		return { framebuffer, blur_texture }
	}

	setup_vertex_attributes(
		gl: WebGLRenderingContext,
		program: WebGLProgram
	): void {
		const position_loc = gl.getAttribLocation(program, 'a_position')
		const tex_coord_loc = gl.getAttribLocation(program, 'a_texCoord')

		gl.enableVertexAttribArray(position_loc)
		gl.enableVertexAttribArray(tex_coord_loc)
		gl.vertexAttribPointer(position_loc, 2, gl.FLOAT, false, 16, 0)
		gl.vertexAttribPointer(tex_coord_loc, 2, gl.FLOAT, false, 16, 8)
	}

	render(
		canvas: HTMLCanvasElement,
		image: HTMLImageElement,
		color_list: [number, number, number][],
		blur_amount = 0
	) {
		// Validate inputs
		if (
			!color_list ||
			!Array.isArray(color_list) ||
			color_list.length === 0
		) {
			throw new Error('Invalid color_list: must be a non-empty array')
		}

		// Get WebGL context for this specific canvas
		const gl = (canvas.getContext('webgl') ||
			canvas.getContext('experimental-webgl')) as WebGLRenderingContext
		if (!gl) {
			throw new Error('WebGL not supported on this canvas')
		}

		// Initialize or get shaders for this canvas
		const { program, blur_program } = this.init_shaders_for_canvas(
			canvas,
			gl
		)

		const width = image.width
		const height = image.height

		gl.viewport(0, 0, width, height)

		// Create texture from image for this canvas
		const texture = this.create_texture_for_canvas(gl, image)
		let source_texture = texture

		// Apply blur if needed
		let framebuffer = null
		let blur_texture = null
		if (blur_amount > 0) {
			const blur_resources = this.setup_framebuffer_for_canvas(
				gl,
				width,
				height
			)
			framebuffer = blur_resources.framebuffer
			blur_texture = blur_resources.blur_texture

			// Render blur to framebuffer
			gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
			gl.useProgram(blur_program)

			this.setup_vertex_attributes(gl, blur_program)

			gl.uniform1i(gl.getUniformLocation(blur_program, 'u_image'), 0)
			gl.uniform2f(
				gl.getUniformLocation(blur_program, 'u_resolution'),
				width,
				height
			)
			gl.uniform1f(
				gl.getUniformLocation(blur_program, 'u_blurAmount'),
				blur_amount
			)

			gl.bindTexture(gl.TEXTURE_2D, texture)
			gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

			source_texture = blur_texture
		}

		// Render tritonize effect to canvas
		gl.bindFramebuffer(gl.FRAMEBUFFER, null)
		gl.useProgram(program)

		this.setup_vertex_attributes(gl, program)

		// Set uniforms
		gl.uniform1i(gl.getUniformLocation(program, 'u_image'), 0)
		gl.uniform1i(
			gl.getUniformLocation(program, 'u_colorCount'),
			color_list.length
		)

		// Pass color palette to shader
		const color_array = new Float32Array(48) // 16 colors * 3 components
		for (let i = 0; i < Math.min(color_list.length, 16); i++) {
			color_array[i * 3] = color_list[i][0] / 255
			color_array[i * 3 + 1] = color_list[i][1] / 255
			color_array[i * 3 + 2] = color_list[i][2] / 255
		}
		gl.uniform3fv(gl.getUniformLocation(program, 'u_colors'), color_array)

		gl.bindTexture(gl.TEXTURE_2D, source_texture)
		gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

		// Clean up canvas-specific resources
		gl.deleteTexture(texture)
		if (framebuffer) gl.deleteFramebuffer(framebuffer)
		if (blur_texture) gl.deleteTexture(blur_texture)
	}

	cleanup(): void {
		// Shared resources are cleaned up when the page unloads
		// Individual canvas resources are cleaned up after each render
	}
}
