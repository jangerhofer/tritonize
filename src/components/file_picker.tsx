import { type Component, createSignal, Show } from 'solid-js'
import { Upload, Image as ImageIcon } from 'lucide-solid'
import { Button } from './ui/button'
import { Card, CardContent } from './ui/card'
import Tritonizer from './tritonizer/index'
import { store } from '../store/store'

const FilePicker: Component = () => {
	const [isDragActive, setIsDragActive] = createSignal(false)

	const handleDrop = (e: DragEvent) => {
		e.preventDefault()
		e.stopPropagation()
		setIsDragActive(false)

		const files = e.dataTransfer?.files
		if (files && files[0]) {
			const file = files[0]
			if (file.type.startsWith('image/')) {
				store.actions.add_file(file)
			} else {
				console.error('Please drop a valid image file.')
			}
		}
	}

	const handleDragOver = (e: DragEvent) => {
		e.preventDefault()
		e.stopPropagation()
		setIsDragActive(true)
	}

	const handleDragLeave = (e: DragEvent) => {
		e.preventDefault()
		e.stopPropagation()
		setIsDragActive(false)
	}

	const handleFileInput = (e: Event) => {
		const target = e.target as HTMLInputElement
		const files = target.files
		if (files && files[0]) {
			store.actions.add_file(files[0])
		}
	}

	return (
		<Show when={!store.state.file.file} fallback={<Tritonizer />}>
			<Card
				onDrop={handleDrop}
				onDragOver={handleDragOver}
				onDragLeave={handleDragLeave}
				class={`
					w-full max-w-2xl mx-auto cursor-pointer transition-colors
					${
						isDragActive()
							? 'border-blue-500 bg-blue-50'
							: 'hover:border-blue-400 hover:bg-gray-50'
					}
				`}
			>
				<CardContent class="p-8">
					<input
						type="file"
						onChange={handleFileInput}
						accept="image/png,image/jpeg,image/jpg,image/tiff,image/tif"
						class="hidden"
						id="file-input"
					/>
					<label for="file-input" class="cursor-pointer">
						<div class="flex flex-col items-center gap-4 text-center">
							<Show
								when={isDragActive()}
								fallback={
									<ImageIcon class="h-12 w-12 text-gray-400" />
								}
							>
								<Upload class="h-12 w-12 text-blue-500" />
							</Show>
							<div class="space-y-2">
								<p class="text-lg font-medium">
									{isDragActive()
										? 'Drop your image here'
										: 'Drop an image file here'}
								</p>
								<p class="text-sm text-gray-500">
									Supports PNG, JPEG, and TIFF formats
								</p>
							</div>
							<Button variant="outline" type="button">
								Choose File
							</Button>
						</div>
					</label>
				</CardContent>
			</Card>
		</Show>
	)
}

export default FilePicker
