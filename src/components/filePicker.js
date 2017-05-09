import React, {Component} from 'react'
import Dropzone from 'react-dropzone'

import Tritonizer from './tritonizer/'

export default class FilePicker extends Component {
	constructor() {
		super()
		this.state = {file: null}
	}

	onDrop(file) {
		this.setState({
			file: file[0]
		})
	}

	render() {
		if (this.state.file) {
			return <Tritonizer image={this.state.file}/>
		}
		return (
			<section>
				<div className="dropzone">
					<Dropzone
						onDropAccepted={this.onDrop.bind(this)} accept={'image/png,image/tiff,image/jpeg'} onDropRejected={() => {
							alert('Please drop a valid image file.')
						}} multiple={false}
						   >
						<p>Try dropping some files here, or click to select files to upload.</p>
					</Dropzone>
				</div>
			</section>
		)
	}
}
