import { type Component, onMount, onCleanup, createEffect } from 'solid-js'
import { WebGLTritonizer } from './tritonizer'
import type { Color } from '../../types/index'

interface CanvasProps {
	image: File
	color_list: Color[]
	blur_amount?: number
	id: string | number
	is_visible?: boolean
}

const Canvas: Component<CanvasProps> = (props) => {
	let canvas_ref: HTMLCanvasElement | undefined
	let cleanup_url: (() => void) | undefined

	createEffect(() => {
		if (
			!props.is_visible ||
			!props.image ||
			!canvas_ref ||
			props.color_list.length === 0
		)
			return

		// Clean up previous URL if it exists
		cleanup_url?.()

		const canvas = canvas_ref
		const img = new Image()
		const url = URL.createObjectURL(props.image)

		img.onload = () => {
			if (img.naturalWidth <= 0 || img.naturalHeight <= 0) return

			canvas.width = img.naturalWidth
			canvas.height = img.naturalHeight

			try {
				const tritonizer = WebGLTritonizer.get_instance()
				tritonizer.render(
					canvas,
					img,
					props.color_list,
					props.blur_amount || 0
				)
			} catch (error) {
				console.error('WebGL render failed:', error)
			}
		}

		img.src = url

		cleanup_url = () => URL.revokeObjectURL(url)
	})

	onCleanup(() => {
		cleanup_url?.()
	})

	return (
		<li
			class="list-none m-2.5 inline-block p-1.5 align-top"
			data-index={props.id}
		>
			<canvas
				ref={canvas_ref}
				class="max-w-[300px] max-h-[300px] block"
			/>
		</li>
	)
}

export default Canvas
