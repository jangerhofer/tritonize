import _ from 'lodash'
import { ColorState, ColorAction } from '../types/index'

const initialState: ColorState = {
	colors: [
		[198, 12, 48],
		[255, 255, 255],
		[0, 0, 0]
					//    [228, 219, 204],
						//  [60, 74, 198],
							// [79, 243, 222]
	],
	blurAmount: 0
}

export default (state = initialState, action: ColorAction): ColorState => {
	switch (action.type) {
		case 'COLOR/CHANGE':
			return {
				...state,
				colors: [
					...state.colors.slice(0, action.index),
					action.color,
					...state.colors.slice(action.index + 1)
				]
			}
		case 'COLOR/ADD':
		// Should colors be unique?  Will affect "COLOR/REMOVE"...
			return {
				...state,
				colors: [...state.colors, action.color]
			}
		case 'COLOR/RESET_LIST':
			return {
				...state,
				colors: []
			}
		case 'COLOR/BLUR_CHANGE':
			return {
				...state,
				blurAmount: action.blurAmount
			}
		case 'COLOR/REMOVE':
			return {
				...state,
				colors: _.filter(state.colors, n => {
	  			return !_.isEqual(n, action.color)
				})
			}
		default:
			return state
	}
}
