import { createSlice, PayloadAction } from '@reduxjs/toolkit'

interface FileState {
  file: File | null
}

const initialState: FileState = {
  file: null
}

const fileSlice = createSlice({
  name: 'file',
  initialState,
  reducers: {
    addFile: (state, action: PayloadAction<File>) => {
      state.file = action.payload
    },
    clearFile: (state) => {
      state.file = null
    }
  }
})

export const { addFile, clearFile } = fileSlice.actions
export default fileSlice.reducer