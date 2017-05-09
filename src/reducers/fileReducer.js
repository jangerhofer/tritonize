export default (state = {
	file: null
}, action) => {
	switch (action.type) {
		case 'FILE/ADD':
			return {
				...state,
				file : action.file
			}
		default:
			return state
	}
}
