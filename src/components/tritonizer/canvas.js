import React, {Component} from 'react'

import StackBlur, {mul_table, shg_table, BlurStack} from 'stackblur-canvas'
const operative = window.operative
function sigmoid(x) {
	return 1.0 / (1.0 + Math.pow(Math.E, (-((x - 128.0) / 32.0))))
}

function tritonize(data, colorList) {
	for (let i = 0; i < data.length; i += 4) {
		const grayScale = data[i] * 299 / 1000 + data[i + 1] * 587 / 1000 + data[i + 2] * 114 / 1000
		const threshold = sigmoid(grayScale)
		const matchedColor = colorList[Math.floor(threshold * colorList.length)]
		data[i] = matchedColor[0]
		data[i + 1] = matchedColor[1]
		data[i + 2] = matchedColor[2]
		data[3] = 255
	}
	return data
}

const imageManipulator = operative({
	BlurStack,
	mul_table,
	shg_table,
	blurImage: StackBlur.imageDataRGBA,
	sigmoid,
	tritonize,
	run(jobData, cb) {
		cb(this.tritonize(jobData.imageData, jobData.colorList), jobData)
	}
})

const calculateAspectRatioFit = (srcWidth, srcHeight, maxWidth, maxHeight) => {
	const ratio = Math.min(maxWidth / srcWidth, maxHeight / srcHeight)
	const rtnWidth = srcWidth * ratio
	const rtnHeight = srcHeight * ratio
	return {
		width: rtnWidth,
		height: rtnHeight
	}
}

const styles = {
	canvas: {
		maxWidth: '100%',
		maxHeight: '100%'
	}
}
export default class Canvas extends Component {

	constructor(props) {
		super(props)

		const img = new Image()
		img.src = this.props.image.preview
		img.onload = this.handleImageLoaded.bind(this)
		this.state = {
			imageEl: img
		}
	}

	handleImageLoaded(evt) {
		const img = this.state.imageEl
		const canvas = this.refs.canvas
		const ctx = canvas.getContext('2d')
		canvas.width = img.width
		canvas.height = img.height
		const imgSize = calculateAspectRatioFit(img.width, img.height, canvas.width, canvas.height)
		ctx.drawImage(img, 0, 0, imgSize.width, imgSize.height)
		const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
		const originalData = imageData.data
		const jobData = {
			image: {
				height: img.height,
				width: img.width
			},
			imageData: originalData,
			index: this.props.id,
			colorList: this.props.colorList
		}
		imageManipulator.run(jobData, (imageData, originalJobData) => {
			const ctx = canvas.getContext('2d')
			const imgData = ctx.createImageData(canvas.width, canvas.height)
			imgData.data.set(imageData)
			ctx.putImageData(imgData, 0, 0)
		})
	}

	render() {
		return (
			<li>
				<canvas ref={'canvas'} style={styles.canvas}/>
			</li>
		)
	}
}
