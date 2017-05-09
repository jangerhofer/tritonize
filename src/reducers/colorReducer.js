export default (state = {
	colors: [
		[0, 0, 0]
	]
}, action) => {
	switch (action.type) {
		case 'COLOR/RESET_LIST':
			return {
				...state,
				colors: []
			}
		default:
			return state
	}
}
