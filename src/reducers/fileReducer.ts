import { FileState, FileAction } from '../types/index'

const initialState: FileState = {
	file: null
}

export default (state = initialState, action: FileAction): FileState => {
	switch (action.type) {
		case 'FILE/ADD':
			return {
				...state,
				file: action.file
			}
		case 'FILE/CLEAR':
			return {
				...state,
				file: null
			}
		default:
			return state
	}
}
