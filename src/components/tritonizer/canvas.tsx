import { useRef, useEffect, useState, useCallback } from 'react'
import { WebGLTritonizer } from './tritonizer'

interface CanvasProps {
	image: File
	colorList: [number, number, number][]
	blurAmount?: number
	id: string | number
}

export default function Canvas({
	image,
	colorList,
	blurAmount = 0,
}: CanvasProps) {
	const canvas_ref = useRef<HTMLCanvasElement>(null)
	const [image_el, set_image_el] = useState<HTMLImageElement | null>(null)

	const render_webgl = useCallback(() => {
		const canvas = canvas_ref.current
		if (canvas && image_el && colorList && colorList.length > 0) {
			try {
				const tritonizer = WebGLTritonizer.getInstance()
				tritonizer.render(canvas, image_el, colorList, blurAmount)
			} catch (error) {
				console.error('WebGL render failed:', error)
			}
		}
	}, [image_el, colorList, blurAmount])

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
		if (!image) return

		const img = new Image()
		// Don't set crossOrigin for blob URLs
		const url = URL.createObjectURL(image)

		img.onload = handle_image_loaded
		img.onerror = (error) => {
			console.error('Image failed to load:', error)
		}

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
		<li className="list-none m-2.5 inline-block border border-gray-300 p-1.5 align-top">
			<canvas
				ref={canvas_ref}
				className="max-w-[300px] max-h-[300px] block"
			/>
		</li>
	)
}
