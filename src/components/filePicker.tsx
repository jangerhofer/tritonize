import React, { useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { connect } from 'react-redux'
import { Upload, Image as ImageIcon } from 'lucide-react'
import { Button } from './ui/button'
import { Card, CardContent } from './ui/card'
import Tritonizer from './tritonizer/index.tsx'

interface FilePickerProps {
	file?: File
	addNewFile: (file: File) => void
}

function FilePicker({ file, addNewFile }: FilePickerProps) {
	const onDrop = useCallback((acceptedFiles: File[]) => {
		if (acceptedFiles[0]) {
			addNewFile(acceptedFiles[0])
		}
	}, [addNewFile])

	const onDropRejected = useCallback(() => {
		// Using a more modern approach instead of alert
		console.error('Please drop a valid image file.')
	}, [])

	const { getRootProps, getInputProps, isDragActive } = useDropzone({
		onDrop,
		onDropRejected,
		accept: {
			'image/png': ['.png'],
			'image/jpeg': ['.jpg', '.jpeg'],
			'image/tiff': ['.tiff', '.tif']
		},
		multiple: false
	})

	if (file) {
		return <Tritonizer />
	}

	return (
		<Card className="w-full max-w-2xl mx-auto">
			<CardContent className="p-8">
				<div
					{...getRootProps()}
					className={`
						border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors
						${isDragActive 
							? 'border-primary bg-primary/5' 
							: 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/25'
						}
					`}
				>
					<input {...getInputProps()} />
					<div className="flex flex-col items-center gap-4">
						{isDragActive ? (
							<Upload className="h-12 w-12 text-primary" />
						) : (
							<ImageIcon className="h-12 w-12 text-muted-foreground" />
						)}
						<div className="space-y-2">
							<p className="text-lg font-medium">
								{isDragActive ? 'Drop your image here' : 'Drop an image file here'}
							</p>
							<p className="text-sm text-muted-foreground">
								Supports PNG, JPEG, and TIFF formats
							</p>
						</div>
						<Button variant="outline" type="button">
							Choose File
						</Button>
					</div>
				</div>
			</CardContent>
		</Card>
	)
}

export default connect(
	(state: any) => ({
		file: state.FileReducer.file
	}),
	(dispatch: any) => ({
		addNewFile: (file: File) => {
			dispatch({ type: 'FILE/ADD', file })
		}
	})
)(FilePicker)
