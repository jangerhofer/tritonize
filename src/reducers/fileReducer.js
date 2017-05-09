export default (state = {
	file: null
}, action) => {
	switch (action.type) {
		case 'FILE/ADD':
			return {
				...state,
				file : action.file
			}
		case 'FILE/CLEAR':
			return {
				...state,
				file : null
			}
		default:
			return state
	}
}
