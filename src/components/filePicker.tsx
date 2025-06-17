import React, {Component} from 'react'
import Dropzone from 'react-dropzone'
import {connect} from 'react-redux'

import Tritonizer from './tritonizer/index.tsx'

class FilePicker extends Component {

	onDrop(file) {
		this.props.addNewFile(file[0])
	}

	render() {
		if (this.props.file) {
			return <Tritonizer/>
		}
		return (
			<section>
				<div className="dropzone">
					<Dropzone
						onDropAccepted={this.onDrop.bind(this)} accept={'image/png,image/tiff,image/jpeg'} onDropRejected={() => {
							alert('Please drop a valid image file.')
						}} multiple={false}
						   >
						<center><p>Drop a valid image file here.</p></center>
					</Dropzone>
				</div>
			</section>
		)
	}
}

export default connect(
	state => ({
		file: state.FileReducer.file
	}),
	dispatch => ({
		addNewFile: file => {
			dispatch({type: 'FILE/ADD', file})
		}
	})
)(FilePicker)
