import { type Component, For } from 'solid-js'
import { Trash2, RotateCcw } from 'lucide-solid'
import { Button } from '../ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Slider } from '../ui/slider'
import ColorCell from './color_cell'
import { store } from '../../store/store'

const ColorList: Component = () => {
	const handle_clear_colors = () => {
		store.actions.reset_colors()
	}

	const handle_clear_file = () => {
		store.actions.clear_file()
	}

	const handle_blur_change = (values: number[]) => {
		store.actions.change_blur_amount(values[0])
	}

	return (
		<div class="space-y-4">
			<Card>
				<CardHeader>
					<CardTitle class="text-lg">Color Palette</CardTitle>
				</CardHeader>
				<CardContent class="space-y-4">
					<div class="grid gap-3">
						<For each={store.state.color.colors}>
							{(color, i) => (
								<ColorCell
									index={i()}
									color={`rgb(${color[0]},${color[1]},${color[2]})`}
								/>
							)}
						</For>
						<ColorCell is_new color="rgb(255,255,255)">
							+
						</ColorCell>
					</div>

					<div class="space-y-3">
						<div class="flex items-center justify-between">
							<label class="text-sm font-medium">
								Blur Amount
							</label>
							<span class="text-sm text-gray-500">
								{store.state.color.blur_amount}
							</span>
						</div>
						<Slider
							value={[store.state.color.blur_amount]}
							onChange={handle_blur_change}
							min={0}
							max={5}
							step={0.1}
							class="w-full"
						/>
					</div>
				</CardContent>
			</Card>

			<div class="flex gap-2">
				<Button
					variant="outline"
					onClick={handle_clear_colors}
					class="flex-1"
				>
					<Trash2 class="w-4 h-4 mr-2" />
					Clear Colors
				</Button>
				<Button
					variant="outline"
					onClick={handle_clear_file}
					class="flex-1"
				>
					<RotateCcw class="w-4 h-4 mr-2" />
					Clear File
				</Button>
			</div>
		</div>
	)
}

export default ColorList
