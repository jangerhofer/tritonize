import React from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { Trash2, RotateCcw } from 'lucide-react'
import { Button } from '../ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Slider } from '../ui/slider'
import ColorCell from './color_cell.tsx'
import { resetColors, changeBlurAmount } from '../../store/color_slice'
import { clearFile } from '../../store/file_slice'
import { RootState } from '../../store/index'

function ColorList() {
	const dispatch = useDispatch()
	const color_list_data = useSelector((state: RootState) => state.color.colors)
	const blur_amount = useSelector((state: RootState) => state.color.blurAmount)

	const handle_clear_colors = () => {
		dispatch(resetColors())
	}

	const handle_clear_file = () => {
		dispatch(clearFile())
	}

	const handle_blur_change = (value: number) => {
		dispatch(changeBlurAmount(value))
	}
	return (
		<div className="space-y-4">
			<Card>
				<CardHeader>
					<CardTitle className="text-lg">Color Palette</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="grid gap-3">
						{color_list_data.map((color, i) => (
							<ColorCell 
								key={i} 
								index={i} 
								color={`rgb(${color[0]},${color[1]},${color[2]})`}
							/>
						))}
						<ColorCell is_new color="rgb(255,255,255)">
							+
						</ColorCell>
					</div>
					
					<div className="space-y-3">
						<div className="flex items-center justify-between">
							<label className="text-sm font-medium">Blur Amount</label>
							<span className="text-sm text-gray-500">{blur_amount}</span>
						</div>
						<Slider
							value={[blur_amount]}
							onValueChange={(values) => handle_blur_change(values[0])}
							min={0}
							max={5}
							step={0.1}
							disabled
							className="w-full"
						/>
					</div>
				</CardContent>
			</Card>
			
			<div className="flex gap-2">
				<Button 
					variant="outline" 
					onClick={handle_clear_colors}
					className="flex-1"
				>
					<Trash2 className="w-4 h-4 mr-2" />
					Clear Colors
				</Button>
				<Button 
					variant="outline" 
					onClick={handle_clear_file}
					className="flex-1"
				>
					<RotateCcw className="w-4 h-4 mr-2" />
					Clear File
				</Button>
			</div>
		</div>
	)
}

export default ColorList
