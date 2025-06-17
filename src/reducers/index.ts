import {combineReducers} from 'redux'
import { RootState } from '../types/index'

import ColorReducer from './colorReducer'
import FileReducer from './fileReducer'

const rootReducer = combineReducers({
	ColorReducer,
	FileReducer
})

export type { RootState }
export default rootReducer
