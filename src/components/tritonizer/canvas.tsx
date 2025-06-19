import React, { Component, createRef } from 'react'
import _ from 'lodash'

interface CanvasProps {
	image: File
	colorList: [number, number, number][]
	blurAmount?: number
	id: string | number
}

interface CanvasState {
	imageEl: HTMLImageElement
}

// Shared WebGL tritonizer instance
let sharedTritonizer: WebGLTritonizer | null = null

class WebGLTritonizer {
	private gl: WebGLRenderingContext | null = null
	private program: WebGLProgram | null = null
	private blurProgram: WebGLProgram | null = null
	private positionBuffer: WebGLBuffer | null = null

	constructor() {
		// Only create shaders once
		if (sharedTritonizer) {
			return sharedTritonizer
		}
		sharedTritonizer = this
	}

	static getInstance(): WebGLTritonizer {
		if (!sharedTritonizer) {
			sharedTritonizer = new WebGLTritonizer()
		}
		return sharedTritonizer
	}

	initShaders() {
		if (this.program && this.blurProgram) {
			return // Already initialized
		}

		// Create a temporary canvas to get WebGL context for shader compilation
		const tempCanvas = document.createElement('canvas')
		this.gl =
			tempCanvas.getContext('webgl') ||
			tempCanvas.getContext('experimental-webgl')
		if (!this.gl) {
			throw new Error('WebGL not supported')
		}

		// Vertex shader for full-screen quad
		const vertexShaderSource = `
			attribute vec2 a_position;
			attribute vec2 a_texCoord;
			varying vec2 v_texCoord;
			
			void main() {
				gl_Position = vec4(a_position, 0.0, 1.0);
				v_texCoord = a_texCoord;
			}
		`

		// Fragment shader for tritonize effect
		const fragmentShaderSource = `
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
		const blurFragmentShaderSource = `
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

		this.program = this.createProgram(
			vertexShaderSource,
			fragmentShaderSource
		)
		this.blurProgram = this.createProgram(
			vertexShaderSource,
			blurFragmentShaderSource
		)
		this.setupGeometry()
	}

	createShader(type, source) {
		const shader = this.gl.createShader(type)
		this.gl.shaderSource(shader, source)
		this.gl.compileShader(shader)

		if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
			throw new Error(
				'Shader compile error: ' + this.gl.getShaderInfoLog(shader)
			)
		}

		return shader
	}

	createProgram(vertexSource, fragmentSource) {
		const vertexShader = this.createShader(
			this.gl.VERTEX_SHADER,
			vertexSource
		)
		const fragmentShader = this.createShader(
			this.gl.FRAGMENT_SHADER,
			fragmentSource
		)

		const program = this.gl.createProgram()
		this.gl.attachShader(program, vertexShader)
		this.gl.attachShader(program, fragmentShader)
		this.gl.linkProgram(program)

		if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
			throw new Error(
				'Program link error: ' + this.gl.getProgramInfoLog(program)
			)
		}

		return program
	}

	setupGeometry() {
		const positions = new Float32Array([
			-1, -1, 0, 0, 1, -1, 1, 0, -1, 1, 0, 1, 1, 1, 1, 1,
		])

		const buffer = this.gl.createBuffer()
		this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer)
		this.gl.bufferData(this.gl.ARRAY_BUFFER, positions, this.gl.STATIC_DRAW)
	}

	createTextureForCanvas(gl: WebGLRenderingContext, image: HTMLImageElement) {
		const texture = gl.createTexture()
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

	setupFramebufferForCanvas(
		gl: WebGLRenderingContext,
		width: number,
		height: number
	) {
		const framebuffer = gl.createFramebuffer()
		const blurTexture = gl.createTexture()

		gl.bindTexture(gl.TEXTURE_2D, blurTexture)
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
			blurTexture,
			0
		)

		return { framebuffer, blurTexture }
	}

	setupVertexAttributes(gl: WebGLRenderingContext, program: WebGLProgram) {
		const positionLoc = gl.getAttribLocation(program, 'a_position')
		const texCoordLoc = gl.getAttribLocation(program, 'a_texCoord')

		gl.enableVertexAttribArray(positionLoc)
		gl.enableVertexAttribArray(texCoordLoc)
		gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 16, 0)
		gl.vertexAttribPointer(texCoordLoc, 2, gl.FLOAT, false, 16, 8)
	}

	render(
		canvas: HTMLCanvasElement,
		image: HTMLImageElement,
		colorList: [number, number, number][],
		blurAmount = 0
	) {
		// Initialize shaders once
		this.initShaders()

		// Get WebGL context for this specific canvas
		const gl =
			canvas.getContext('webgl') ||
			canvas.getContext('experimental-webgl')
		if (!gl) {
			throw new Error('WebGL not supported on this canvas')
		}

		const width = image.width || image.videoWidth
		const height = image.height || image.videoHeight

		console.log(
			'WebGL render - image size:',
			width,
			'x',
			height,
			'colors:',
			colorList.length
		)

		gl.viewport(0, 0, width, height)

		// Create texture from image for this canvas
		const texture = this.createTextureForCanvas(gl, image)
		let sourceTexture = texture

		// Apply blur if needed
		let framebuffer = null
		let blurTexture = null
		if (blurAmount > 0) {
			const blurResources = this.setupFramebufferForCanvas(
				gl,
				width,
				height
			)
			framebuffer = blurResources.framebuffer
			blurTexture = blurResources.blurTexture

			// Render blur to framebuffer
			gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
			gl.useProgram(this.blurProgram)

			this.setupVertexAttributes(gl, this.blurProgram)

			gl.uniform1i(gl.getUniformLocation(this.blurProgram, 'u_image'), 0)
			gl.uniform2f(
				gl.getUniformLocation(this.blurProgram, 'u_resolution'),
				width,
				height
			)
			gl.uniform1f(
				gl.getUniformLocation(this.blurProgram, 'u_blurAmount'),
				blurAmount
			)

			gl.bindTexture(gl.TEXTURE_2D, texture)
			gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

			sourceTexture = blurTexture
		}

		// Render tritonize effect to canvas
		gl.bindFramebuffer(gl.FRAMEBUFFER, null)
		gl.useProgram(this.program)

		this.setupVertexAttributes(gl, this.program)

		// Set uniforms
		gl.uniform1i(gl.getUniformLocation(this.program, 'u_image'), 0)
		gl.uniform1i(
			gl.getUniformLocation(this.program, 'u_colorCount'),
			colorList.length
		)

		// Pass color palette to shader
		const colorArray = new Float32Array(48) // 16 colors * 3 components
		for (let i = 0; i < Math.min(colorList.length, 16); i++) {
			colorArray[i * 3] = colorList[i][0] / 255
			colorArray[i * 3 + 1] = colorList[i][1] / 255
			colorArray[i * 3 + 2] = colorList[i][2] / 255
		}
		gl.uniform3fv(
			gl.getUniformLocation(this.program, 'u_colors'),
			colorArray
		)

		gl.bindTexture(gl.TEXTURE_2D, sourceTexture)
		gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

		// Clean up canvas-specific resources
		gl.deleteTexture(texture)
		if (framebuffer) gl.deleteFramebuffer(framebuffer)
		if (blurTexture) gl.deleteTexture(blurTexture)
	}

	cleanup() {
		// Shared resources are cleaned up when the page unloads
		// Individual canvas resources are cleaned up after each render
	}
}

const styles = {
	canvas: {
		maxWidth: '300px',
		maxHeight: '300px',
		display: 'block',
	},
	listItem: {
		listStyle: 'none',
		margin: '10px',
		display: 'inline-block',
		border: '1px solid #ccc',
		padding: '5px',
		verticalAlign: 'top',
	},
}

export default class Canvas extends Component<CanvasProps, CanvasState> {
	private canvasRef = createRef<HTMLCanvasElement>()
	private imageUrl: string

	constructor(props: CanvasProps) {
		super(props)

		console.log('Canvas constructor called with image:', this.props.image)

		const img = new Image()
		img.crossOrigin = 'anonymous' // Allow cross-origin images
		img.onload = this.handleImageLoaded.bind(this)
		img.onerror = (error) => {
			console.error('Image failed to load:', error)
		}

		// Create object URL from the File object
		this.imageUrl = URL.createObjectURL(this.props.image)
		console.log('Setting image src to:', this.imageUrl)
		img.src = this.imageUrl

		this.state = {
			imageEl: img,
		}
	}

	componentWillUnmount() {
		// Clean up the object URL to prevent memory leaks
		if (this.imageUrl) {
			URL.revokeObjectURL(this.imageUrl)
		}
	}

	handleImageLoaded = () => {
		console.log('handleImageLoaded called!')
		const img = this.state.imageEl
		const canvas = this.canvasRef.current

		if (!canvas) {
			console.error('Canvas ref not found')
			return
		}

		console.log('Image loaded:', img.width, 'x', img.height)
		console.log('Canvas element found:', canvas)

		// Set canvas internal resolution to match image exactly
		canvas.width = img.width
		canvas.height = img.height

		try {
			this.renderWebGL()
		} catch (error) {
			console.error('WebGL render failed:', error)
		}
	}

	renderWebGL() {
		const canvas = this.canvasRef.current
		if (canvas && this.state.imageEl) {
			console.log('Rendering with colors:', this.props.colorList)
			try {
				const tritonizer = WebGLTritonizer.getInstance()
				tritonizer.render(
					canvas,
					this.state.imageEl,
					this.props.colorList,
					this.props.blurAmount || 0
				)
				console.log('WebGL render completed')
			} catch (error) {
				console.error('WebGL render failed:', error)
			}
		}
	}

	shouldComponentUpdate(nextProps: CanvasProps, nextState: CanvasState) {
		// Check if colors are the same
		if (
			_.isEqual(this.props.colorList, nextProps.colorList) &&
			this.props.blurAmount === nextProps.blurAmount
		) {
			return false
		}

		return true
	}

	componentDidUpdate(prevProps: CanvasProps) {
		// Re-render when props change
		if (
			!_.isEqual(this.props.colorList, prevProps.colorList) ||
			this.props.blurAmount !== prevProps.blurAmount
		) {
			if (this.state.imageEl) {
				this.renderWebGL()
			}
		}
	}

	render() {
		console.log('Canvas render called with props:', this.props.id)
		return (
			<li style={styles.listItem}>
				<canvas ref={this.canvasRef} style={styles.canvas} />
			</li>
		)
	}
}
