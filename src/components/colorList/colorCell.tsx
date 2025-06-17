import React, { useState } from 'react'
import { connect } from 'react-redux'
import { SketchPicker } from 'react-color'
import chroma from 'chroma-js'
import { X, Plus } from 'lucide-react'
import { Button } from '../ui/button'
import { Card } from '../ui/card'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../ui/popover"

interface ColorCellProps {
	color: string
	index?: number
	isNew?: boolean
	children?: React.ReactNode
	handleDeleteColor?: () => void
	handleAddColor?: (color: number[]) => void
	handleColorChange?: (color: any) => void
}

function ColorCell({ 
	color, 
	isNew = false, 
	children,
	handleDeleteColor,
	handleAddColor,
	handleColorChange 
}: ColorCellProps) {
	const [isOpen, setIsOpen] = useState(false)

	const handleClick = () => {
		if (isNew && handleAddColor) {
			handleAddColor(chroma('white').rgb())
		}
	}

	if (isNew) {
		return (
			<Card 
				className="p-4 border-2 border-dashed border-gray-300 hover:border-blue-400 cursor-pointer transition-colors flex items-center justify-center min-h-12"
				onClick={handleClick}
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
			<Popover open={isOpen} onOpenChange={setIsOpen}>
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
						onChange={handleColorChange}
						onChangeComplete={() => setIsOpen(false)}
					/>
				</PopoverContent>
			</Popover>
			
			<Button
				variant="ghost"
				size="icon"
				onClick={handleDeleteColor}
				className="text-red-500 hover:text-red-700 hover:bg-red-50"
			>
				<X size={16} />
			</Button>
		</div>
	)
}

export default connect(
	null, 
	(dispatch: any, ownProps: ColorCellProps) => ({
		handleDeleteColor: () => {
			dispatch({ type: 'COLOR/REMOVE', color: chroma(ownProps.color).rgb() })
		},
		handleAddColor: (color: number[]) => dispatch({ type: 'COLOR/ADD', color }),
		handleColorChange: (color: any) => {
			dispatch({ 
				type: 'COLOR/CHANGE', 
				index: ownProps.index, 
				color: [color.rgb.r, color.rgb.g, color.rgb.b] 
			})
		}
	})
)(ColorCell)