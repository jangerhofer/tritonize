import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import _ from 'lodash'
import { Color } from '../types/index'

interface ColorState {
	colors: Color[]
	blur_amount: number
}

const initialState: ColorState = {
	colors: [
		[198, 12, 48],
		[255, 255, 255],
		[0, 0, 0],
	],
	blur_amount: 0,
}

const colorSlice = createSlice({
	name: 'color',
	initialState,
	reducers: {
		change_color: (
			state,
			action: PayloadAction<{ index: number; color: Color }>
		) => {
			state.colors[action.payload.index] = action.payload.color
		},
		add_color: (state, action: PayloadAction<Color>) => {
			state.colors.push(action.payload)
		},
		reset_colors: (state) => {
			state.colors = []
		},
		change_blur_amount: (state, action: PayloadAction<number>) => {
			state.blur_amount = action.payload
		},
		remove_color: (state, action: PayloadAction<Color>) => {
			state.colors = state.colors.filter(
				(color) => !_.isEqual(color, action.payload)
			)
		},
	},
})

export const {
	change_color,
	add_color,
	reset_colors,
	change_blur_amount,
	remove_color,
} = colorSlice.actions
export default colorSlice.reducer
