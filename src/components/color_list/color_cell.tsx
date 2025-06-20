import { type Component, type JSX, createSignal, Show } from 'solid-js'
import chroma from 'chroma-js'
import { X, Plus } from 'lucide-solid'
import { Button } from '../ui/button'
import { Card } from '../ui/card'
import { store } from '../../store/store'

interface ColorCellProps {
	color: string
	index?: number
	is_new?: boolean
	children?: JSX.Element
}

const ColorCell: Component<ColorCellProps> = (props) => {
	const [isOpen, setIsOpen] = createSignal(false)
	const [tempColor, setTempColor] = createSignal(props.color)

	const handleClick = () => {
		if (props.is_new) {
			store.actions.add_color(chroma('white').rgb())
		}
	}

	const handleDeleteColor = () => {
		store.actions.remove_color(chroma(props.color).rgb())
	}

	const handleColorChange = (e: Event) => {
		const target = e.target as HTMLInputElement
		const newColor = target.value
		setTempColor(newColor)

		if (props.index !== undefined) {
			const rgb = chroma(newColor).rgb()
			store.actions.change_color(props.index, rgb)
		}
	}

	const rgbToHex = (color: string): string => {
		const match = color.match(/rgb\((\d+),(\d+),(\d+)\)/)
		if (match) {
			const r = parseInt(match[1])
			const g = parseInt(match[2])
			const b = parseInt(match[3])
			return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`
		}
		return '#ffffff'
	}

	return (
		<Show
			when={!props.is_new}
			fallback={
				<Card
					class="p-4 border-2 border-dashed border-gray-300 hover:border-blue-400 cursor-pointer transition-colors flex items-center justify-center min-h-12"
					onClick={handleClick}
				>
					<div class="flex items-center gap-2 text-gray-500">
						<Plus size={16} />
						<span class="text-sm font-medium">Add Color</span>
					</div>
				</Card>
			}
		>
			<div class="flex items-center gap-2">
				<div class="relative flex-1">
					<div
						class="h-12 rounded-lg border-2 border-gray-200 cursor-pointer hover:border-blue-400 transition-colors"
						style={{ 'background-color': props.color }}
						title={`Click to edit color: ${props.color}`}
						onClick={() => setIsOpen(!isOpen())}
					/>
					<Show when={isOpen()}>
						<div class="absolute top-14 left-0 z-50 w-64 rounded-md border bg-white p-4 shadow-md">
							<div class="space-y-4">
								<input
									type="color"
									value={rgbToHex(tempColor())}
									onInput={handleColorChange}
									class="w-full h-32 cursor-pointer"
								/>
								<div class="text-sm text-gray-600">
									Current: {tempColor()}
								</div>
								<Button
									onClick={() => setIsOpen(false)}
									variant="outline"
									class="w-full"
								>
									Close
								</Button>
							</div>
						</div>
					</Show>
				</div>

				<Button
					variant="ghost"
					size="icon"
					onClick={handleDeleteColor}
					class="text-red-500 hover:text-red-700 hover:bg-red-50"
				>
					<X size={16} />
				</Button>
			</div>
		</Show>
	)
}

export default ColorCell
