import React from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { Trash2, RotateCcw } from 'lucide-react'
import { Button } from '../ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Slider } from '../ui/slider'
import ColorCell from './colorCell.tsx'
import { resetColors, changeBlurAmount } from '../../store/colorSlice'
import { clearFile } from '../../store/fileSlice'
import { RootState } from '../../store/index'

function ColorList() {
	const dispatch = useDispatch()
	const colorList = useSelector((state: RootState) => state.color.colors)
	const blurAmount = useSelector((state: RootState) => state.color.blurAmount)

	const handleClearColors = () => {
		dispatch(resetColors())
	}

	const handleClearFile = () => {
		dispatch(clearFile())
	}

	const handleBlurChange = (value: number) => {
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
						{colorList.map((color, i) => (
							<ColorCell 
								key={i} 
								index={i} 
								color={`rgb(${color[0]},${color[1]},${color[2]})`}
							/>
						))}
						<ColorCell isNew color="rgb(255,255,255)">
							+
						</ColorCell>
					</div>
					
					<div className="space-y-3">
						<div className="flex items-center justify-between">
							<label className="text-sm font-medium">Blur Amount</label>
							<span className="text-sm text-gray-500">{blurAmount}</span>
						</div>
						<Slider
							value={[blurAmount]}
							onValueChange={(values) => handleBlurChange(values[0])}
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
					onClick={handleClearColors}
					className="flex-1"
				>
					<Trash2 className="w-4 h-4 mr-2" />
					Clear Colors
				</Button>
				<Button 
					variant="outline" 
					onClick={handleClearFile}
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
