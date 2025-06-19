import { createSlice, PayloadAction } from '@reduxjs/toolkit'

interface FileState {
	file: File | null
}

const initialState: FileState = {
	file: null,
}

const fileSlice = createSlice({
	name: 'file',
	initialState,
	reducers: {
		add_file: (state, action: PayloadAction<File>) => {
			state.file = action.payload
		},
		clear_file: (state) => {
			state.file = null
		},
	},
})

export const { add_file, clear_file } = fileSlice.actions
export default fileSlice.reducer
