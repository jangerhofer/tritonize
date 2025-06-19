import React, { useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { useSelector, useDispatch } from 'react-redux'
import { Upload, Image as ImageIcon } from 'lucide-react'
import { Button } from './ui/button'
import { Card, CardContent } from './ui/card'
import Tritonizer from './tritonizer/index.tsx'
import { addFile } from '../store/file_slice'
import { RootState } from '../store/index'

function FilePicker() {
	const dispatch = useDispatch()
	const file = useSelector((state: RootState) => state.file.file)

	const on_drop = useCallback(
		(accepted_files: File[]) => {
			if (accepted_files[0]) {
				dispatch(addFile(accepted_files[0]))
			}
		},
		[dispatch]
	)

	const on_drop_rejected = useCallback(() => {
		console.error('Please drop a valid image file.')
	}, [])

	const { getRootProps, getInputProps, isDragActive } = useDropzone({
		onDrop: on_drop,
		onDropRejected: on_drop_rejected,
		accept: {
			'image/png': ['.png'],
			'image/jpeg': ['.jpg', '.jpeg'],
			'image/tiff': ['.tiff', '.tif'],
		},
		multiple: false,
	})

	if (file) {
		return <Tritonizer />
	}

	return (
		<Card
			{...getRootProps()}
			className={`
				w-full max-w-2xl mx-auto cursor-pointer transition-colors
				${
					isDragActive
						? 'border-blue-500 bg-blue-50'
						: 'hover:border-blue-400 hover:bg-gray-50'
				}
			`}
		>
			<CardContent className="p-8">
				<input {...getInputProps()} />
				<div className="flex flex-col items-center gap-4 text-center">
					{isDragActive ? (
						<Upload className="h-12 w-12 text-blue-500" />
					) : (
						<ImageIcon className="h-12 w-12 text-gray-400" />
					)}
					<div className="space-y-2">
						<p className="text-lg font-medium">
							{isDragActive
								? 'Drop your image here'
								: 'Drop an image file here'}
						</p>
						<p className="text-sm text-gray-500">
							Supports PNG, JPEG, and TIFF formats
						</p>
					</div>
					<Button variant="outline" type="button">
						Choose File
					</Button>
				</div>
			</CardContent>
		</Card>
	)
}

export default FilePicker
