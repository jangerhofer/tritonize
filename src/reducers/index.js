import {combineReducers} from 'redux'

import ColorReducer from './colorReducer'
import FileReducer from './fileReducer'

export default combineReducers({
	ColorReducer,
	FileReducer
})
