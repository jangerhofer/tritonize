import React, { useState } from 'react'
import { useDispatch } from 'react-redux'
import { SketchPicker } from 'react-color'
import chroma from 'chroma-js'
import { X, Plus } from 'lucide-react'
import { Button } from '../ui/button'
import { Card } from '../ui/card'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'
import { addColor, removeColor, changeColor } from '../../store/color_slice'

interface color_cell_props {
	color: string
	index?: number
	is_new?: boolean
	children?: React.ReactNode
}

function ColorCell({ color, index, is_new = false }: color_cell_props) {
	const [is_open, set_is_open] = useState(false)
	const dispatch = useDispatch()

	const handle_click = () => {
		if (is_new) {
			dispatch(addColor(chroma('white').rgb()))
		}
	}

	const handle_delete_color = () => {
		dispatch(removeColor(chroma(color).rgb()))
	}

	const handle_color_change = (color: any) => {
		if (index !== undefined) {
			dispatch(
				changeColor({
					index,
					color: [color.rgb.r, color.rgb.g, color.rgb.b],
				})
			)
		}
	}

	if (is_new) {
		return (
			<Card
				className="p-4 border-2 border-dashed border-gray-300 hover:border-blue-400 cursor-pointer transition-colors flex items-center justify-center min-h-12"
				onClick={handle_click}
			>
				<div className="flex items-center gap-2 text-gray-500">
					<Plus size={16} />
					<span className="text-sm font-medium">Add Color</span>
				</div>
			</Card>
		)
	}

	return (
		<div className="flex items-center gap-2">
			<Popover open={is_open} onOpenChange={set_is_open}>
				<PopoverTrigger asChild>
					<div
						className="flex-1 h-12 rounded-lg border-2 border-gray-200 cursor-pointer hover:border-blue-400 transition-colors"
						style={{ backgroundColor: color }}
						title={`Click to edit color: ${color}`}
					/>
				</PopoverTrigger>
				<PopoverContent className="w-auto p-0" align="start">
					<SketchPicker
						color={color}
						onChange={handle_color_change}
						onChangeComplete={() => set_is_open(false)}
					/>
				</PopoverContent>
			</Popover>

			<Button
				variant="ghost"
				size="icon"
				onClick={handle_delete_color}
				className="text-red-500 hover:text-red-700 hover:bg-red-50"
			>
				<X size={16} />
			</Button>
		</div>
	)
}

export default ColorCell
