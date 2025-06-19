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

class WebGLTritonizer {
	constructor() {
		this.gl = null
		this.program = null
		this.blurProgram = null
		this.framebuffer = null
		this.texture = null
		this.blurTexture = null
	}

	initGL(canvas) {
		this.gl =
			canvas.getContext('webgl') ||
			canvas.getContext('experimental-webgl')
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

	createTexture(image) {
		const texture = this.gl.createTexture()
		this.gl.bindTexture(this.gl.TEXTURE_2D, texture)
		this.gl.texImage2D(
			this.gl.TEXTURE_2D,
			0,
			this.gl.RGBA,
			this.gl.RGBA,
			this.gl.UNSIGNED_BYTE,
			image
		)
		this.gl.texParameteri(
			this.gl.TEXTURE_2D,
			this.gl.TEXTURE_WRAP_S,
			this.gl.CLAMP_TO_EDGE
		)
		this.gl.texParameteri(
			this.gl.TEXTURE_2D,
			this.gl.TEXTURE_WRAP_T,
			this.gl.CLAMP_TO_EDGE
		)
		this.gl.texParameteri(
			this.gl.TEXTURE_2D,
			this.gl.TEXTURE_MIN_FILTER,
			this.gl.LINEAR
		)
		this.gl.texParameteri(
			this.gl.TEXTURE_2D,
			this.gl.TEXTURE_MAG_FILTER,
			this.gl.LINEAR
		)
		return texture
	}

	setupFramebuffer(width, height) {
		this.framebuffer = this.gl.createFramebuffer()
		this.blurTexture = this.gl.createTexture()

		this.gl.bindTexture(this.gl.TEXTURE_2D, this.blurTexture)
		this.gl.texImage2D(
			this.gl.TEXTURE_2D,
			0,
			this.gl.RGBA,
			width,
			height,
			0,
			this.gl.RGBA,
			this.gl.UNSIGNED_BYTE,
			null
		)
		this.gl.texParameteri(
			this.gl.TEXTURE_2D,
			this.gl.TEXTURE_WRAP_S,
			this.gl.CLAMP_TO_EDGE
		)
		this.gl.texParameteri(
			this.gl.TEXTURE_2D,
			this.gl.TEXTURE_WRAP_T,
			this.gl.CLAMP_TO_EDGE
		)
		this.gl.texParameteri(
			this.gl.TEXTURE_2D,
			this.gl.TEXTURE_MIN_FILTER,
			this.gl.LINEAR
		)
		this.gl.texParameteri(
			this.gl.TEXTURE_2D,
			this.gl.TEXTURE_MAG_FILTER,
			this.gl.LINEAR
		)

		this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.framebuffer)
		this.gl.framebufferTexture2D(
			this.gl.FRAMEBUFFER,
			this.gl.COLOR_ATTACHMENT0,
			this.gl.TEXTURE_2D,
			this.blurTexture,
			0
		)
	}

	render(image, colorList, blurAmount = 0) {
		if (!this.gl) {
			console.error('WebGL context not initialized')
			return
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

		this.gl.viewport(0, 0, width, height)

		// Create texture from image
		this.texture = this.createTexture(image)

		let sourceTexture = this.texture

		// Apply blur if needed
		if (blurAmount > 0) {
			this.setupFramebuffer(width, height)

			// Render blur to framebuffer
			this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.framebuffer)
			this.gl.useProgram(this.blurProgram)

			const blurPositionLoc = this.gl.getAttribLocation(
				this.blurProgram,
				'a_position'
			)
			const blurTexCoordLoc = this.gl.getAttribLocation(
				this.blurProgram,
				'a_texCoord'
			)

			this.gl.enableVertexAttribArray(blurPositionLoc)
			this.gl.enableVertexAttribArray(blurTexCoordLoc)
			this.gl.vertexAttribPointer(
				blurPositionLoc,
				2,
				this.gl.FLOAT,
				false,
				16,
				0
			)
			this.gl.vertexAttribPointer(
				blurTexCoordLoc,
				2,
				this.gl.FLOAT,
				false,
				16,
				8
			)

			this.gl.uniform1i(
				this.gl.getUniformLocation(this.blurProgram, 'u_image'),
				0
			)
			this.gl.uniform2f(
				this.gl.getUniformLocation(this.blurProgram, 'u_resolution'),
				width,
				height
			)
			this.gl.uniform1f(
				this.gl.getUniformLocation(this.blurProgram, 'u_blurAmount'),
				blurAmount
			)

			this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture)
			this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4)

			sourceTexture = this.blurTexture
		}

		// Render tritonize effect to canvas
		this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null)
		this.gl.useProgram(this.program)

		const positionLoc = this.gl.getAttribLocation(
			this.program,
			'a_position'
		)
		const texCoordLoc = this.gl.getAttribLocation(
			this.program,
			'a_texCoord'
		)

		this.gl.enableVertexAttribArray(positionLoc)
		this.gl.enableVertexAttribArray(texCoordLoc)
		this.gl.vertexAttribPointer(positionLoc, 2, this.gl.FLOAT, false, 16, 0)
		this.gl.vertexAttribPointer(texCoordLoc, 2, this.gl.FLOAT, false, 16, 8)

		// Set uniforms
		this.gl.uniform1i(
			this.gl.getUniformLocation(this.program, 'u_image'),
			0
		)
		this.gl.uniform1i(
			this.gl.getUniformLocation(this.program, 'u_colorCount'),
			colorList.length
		)

		// Pass color palette to shader
		const colorArray = new Float32Array(48) // 16 colors * 3 components
		for (let i = 0; i < Math.min(colorList.length, 16); i++) {
			colorArray[i * 3] = colorList[i][0] / 255
			colorArray[i * 3 + 1] = colorList[i][1] / 255
			colorArray[i * 3 + 2] = colorList[i][2] / 255
		}
		this.gl.uniform3fv(
			this.gl.getUniformLocation(this.program, 'u_colors'),
			colorArray
		)

		this.gl.bindTexture(this.gl.TEXTURE_2D, sourceTexture)
		this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4)
	}

	cleanup() {
		if (this.gl) {
			if (this.texture) this.gl.deleteTexture(this.texture)
			if (this.blurTexture) this.gl.deleteTexture(this.blurTexture)
			if (this.framebuffer) this.gl.deleteFramebuffer(this.framebuffer)
			if (this.program) this.gl.deleteProgram(this.program)
			if (this.blurProgram) this.gl.deleteProgram(this.blurProgram)
		}
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
	private webglTritonizer = new WebGLTritonizer()
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
		if (this.webglTritonizer) {
			this.webglTritonizer.cleanup()
		}
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
			this.webglTritonizer.initGL(canvas)
			console.log('WebGL initialized successfully')
			this.renderWebGL()
		} catch (error) {
			console.error('WebGL initialization failed:', error)
		}
	}

	renderWebGL() {
		if (this.webglTritonizer && this.state.imageEl) {
			console.log('Rendering with colors:', this.props.colorList)
			try {
				this.webglTritonizer.render(
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
