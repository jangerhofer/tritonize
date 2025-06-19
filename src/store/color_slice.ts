import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import _ from 'lodash'
import { Color } from '../types/index'

interface ColorState {
	colors: Color[]
	blurAmount: number
}

const initialState: ColorState = {
	colors: [
		[198, 12, 48],
		[255, 255, 255],
		[0, 0, 0],
	],
	blurAmount: 0,
}

const colorSlice = createSlice({
	name: 'color',
	initialState,
	reducers: {
		changeColor: (
			state,
			action: PayloadAction<{ index: number; color: Color }>
		) => {
			state.colors[action.payload.index] = action.payload.color
		},
		addColor: (state, action: PayloadAction<Color>) => {
			state.colors.push(action.payload)
		},
		resetColors: (state) => {
			state.colors = []
		},
		changeBlurAmount: (state, action: PayloadAction<number>) => {
			state.blurAmount = action.payload
		},
		removeColor: (state, action: PayloadAction<Color>) => {
			state.colors = state.colors.filter(
				(color) => !_.isEqual(color, action.payload)
			)
		},
	},
})

export const {
	changeColor,
	addColor,
	resetColors,
	changeBlurAmount,
	removeColor,
} = colorSlice.actions
export default colorSlice.reducer
