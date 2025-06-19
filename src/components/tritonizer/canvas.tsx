import { useRef, useEffect, useState, useCallback } from 'react'
import { WebGLTritonizer } from './tritonizer'

interface CanvasProps {
	image: File
	color_list: [number, number, number][]
	blur_amount?: number
	id: string | number
}

const styles = {
	canvas: {
		maxWidth: '300px',
		maxHeight: '300px',
		display: 'block',
	},
	list_item: {
		listStyle: 'none',
		margin: '10px',
		display: 'inline-block',
		border: '1px solid #ccc',
		padding: '5px',
		verticalAlign: 'top',
	},
}

export default function Canvas({
	image,
	color_list,
	blur_amount = 0,
}: CanvasProps) {
	const canvas_ref = useRef<HTMLCanvasElement>(null)
	const [image_el, set_image_el] = useState<HTMLImageElement | null>(null)

	const render_webgl = useCallback(() => {
		const canvas = canvas_ref.current
		if (canvas && image_el) {
			try {
				const tritonizer = WebGLTritonizer.getInstance()
				tritonizer.render(canvas, image_el, color_list, blur_amount)
			} catch (error) {
				console.error('WebGL render failed:', error)
			}
		}
	}, [image_el, color_list, blur_amount])

	const handle_image_loaded = useCallback(() => {
		const canvas = canvas_ref.current
		if (!canvas || !image_el) return

		canvas.width = image_el.width
		canvas.height = image_el.height

		try {
			render_webgl()
		} catch (error) {
			console.error('WebGL render failed:', error)
		}
	}, [image_el, render_webgl])

	useEffect(() => {
		const img = new Image()
		img.crossOrigin = 'anonymous'
		img.onload = handle_image_loaded
		img.onerror = (error) => {
			console.error('Image failed to load:', error)
		}

		const url = URL.createObjectURL(image)
		img.src = url
		set_image_el(img)

		return () => {
			if (url) {
				URL.revokeObjectURL(url)
			}
		}
	}, [image, handle_image_loaded])

	useEffect(() => {
		if (image_el) {
			render_webgl()
		}
	}, [render_webgl, image_el])

	return (
		<li style={styles.list_item}>
			<canvas ref={canvas_ref} style={styles.canvas} />
		</li>
	)
}
