import { useRef, useEffect, useState, useCallback } from 'react'
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
	const [image_el, set_image_el] = useState<HTMLImageElement | null>(null)
	const [has_rendered, set_has_rendered] = useState(false)

	const render_webgl = useCallback(() => {
		if (has_rendered || !is_visible) return

		const canvas = canvas_ref.current
		if (
			canvas &&
			image_el &&
			image_el.complete &&
			image_el.naturalWidth > 0 &&
			image_el.naturalHeight > 0 &&
			color_list &&
			color_list.length > 0
		) {
			try {
				const tritonizer = WebGLTritonizer.get_instance()
				tritonizer.render(canvas, image_el, color_list, blur_amount)
				set_has_rendered(true)
			} catch (error) {
				console.error('WebGL render failed:', error)
			}
		}
	}, [image_el, color_list, blur_amount, has_rendered, is_visible])

	const handle_image_loaded = useCallback((img: HTMLImageElement) => {
		const canvas = canvas_ref.current
		if (
			!canvas ||
			!img ||
			!img.complete ||
			img.naturalWidth <= 0 ||
			img.naturalHeight <= 0
		)
			return

		canvas.width = img.naturalWidth
		canvas.height = img.naturalHeight

		set_image_el(img)
	}, [])

	useEffect(() => {
		if (!image) return

		set_has_rendered(false)
		set_image_el(null)

		const img = new Image()
		const url = URL.createObjectURL(image)

		img.onload = () => handle_image_loaded(img)
		img.onerror = (error) => {
			console.error('Image failed to load:', error)
		}

		img.src = url

		return () => {
			URL.revokeObjectURL(url)
		}
	}, [image, handle_image_loaded])

	useEffect(() => {
		set_has_rendered(false)
	}, [color_list, blur_amount])

	useEffect(() => {
		if (image_el && is_visible) {
			render_webgl()
		}
	}, [render_webgl, image_el, is_visible])

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
