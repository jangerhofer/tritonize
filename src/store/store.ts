import { createStore } from 'solid-js/store'
import type { Color } from '../types/index'
import _ from 'lodash'

interface AppState {
	color: {
		colors: Color[]
		blur_amount: number
	}
	file: {
		file: File | null
	}
}

const initialState: AppState = {
	color: {
		colors: [
			[198, 12, 48],
			[255, 255, 255],
			[0, 0, 0],
		],
		blur_amount: 0,
	},
	file: {
		file: null,
	},
}

const [state, setState] = createStore(initialState)

export const store = {
	state,
	actions: {
		// Color actions
		change_color(index: number, color: Color) {
			setState('color', 'colors', index, color)
		},
		add_color(color: Color) {
			setState('color', 'colors', (colors) => [...colors, color])
		},
		reset_colors() {
			setState('color', 'colors', [])
		},
		change_blur_amount(amount: number) {
			setState('color', 'blur_amount', amount)
		},
		remove_color(color: Color) {
			setState('color', 'colors', (colors) =>
				colors.filter((c) => !_.isEqual(c, color))
			)
		},
		// File actions
		add_file(file: File) {
			setState('file', 'file', file)
		},
		clear_file() {
			setState('file', 'file', null)
		},
	},
}
