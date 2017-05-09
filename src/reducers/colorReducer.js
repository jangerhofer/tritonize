import _ from 'lodash'

export default (state = {
	colors: [
		[198, 12, 48],
		[255, 255, 255],
		[0, 0, 0]
					//    [228, 219, 204],
						//  [60, 74, 198],
							// [79, 243, 222]
	],
	blurAmount: 0
}, action) => {
	switch (action.type) {
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
				colors : _.filter(state.colors, n => {
	  			return !_.isEqual(n, action.color)
				})
			}
		default:
			return state
	}
}
