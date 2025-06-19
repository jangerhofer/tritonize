import { useRef, useEffect } from 'react'
import { WebGLTritonizer } from './tritonizer'

interface CanvasProps {
	image: File
	color_list: [number, number, number][]
	blur_amount?: number
	id: string | number
	is_visible?: boolean
}

export default function Canvas({
	image,
	color_list,
	blur_amount = 0,
	is_visible = false,
	id,
}: CanvasProps) {
	const canvas_ref = useRef<HTMLCanvasElement>(null)

	useEffect(() => {
		if (
			!is_visible ||
			!image ||
			!canvas_ref.current ||
			color_list.length === 0
		)
			return

		const canvas = canvas_ref.current
		const img = new Image()
		const url = URL.createObjectURL(image)

		img.onload = () => {
			if (img.naturalWidth <= 0 || img.naturalHeight <= 0) return

			canvas.width = img.naturalWidth
			canvas.height = img.naturalHeight

			try {
				const tritonizer = WebGLTritonizer.get_instance()
				tritonizer.render(canvas, img, color_list, blur_amount)
			} catch (error) {
				console.error('WebGL render failed:', error)
			}
		}

		img.src = url

		return () => URL.revokeObjectURL(url)
	}, [image, color_list, blur_amount, is_visible])

	return (
		<li
			className="list-none m-2.5 inline-block p-1.5 align-top"
			data-index={id}
		>
			<canvas
				ref={canvas_ref}
				className="max-w-[300px] max-h-[300px] block"
			/>
		</li>
	)
}
