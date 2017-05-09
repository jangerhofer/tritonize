import React, {Component} from 'react'
import {connect} from 'react-redux'
import Combinatorics from 'js-combinatorics'

import Canvas from './canvas'

class Tritonizer extends Component {

	render() {
		if (this.props.colorList.length <= 1) {
			return <p>Please choose more than one color; otherwise, your image will show up as a solid rectangle.</p>
		}
		const colorPerms = Combinatorics.permutation(this.props.colorList).toArray()
		const canvasArray = []
		let idNo = 0
		while (idNo < colorPerms.length) {
			canvasArray.push(<Canvas key={idNo} image={this.props.image} id={idNo} colorList={colorPerms[idNo]}/>)
			idNo++
		}
		return (<ul>
			{canvasArray}
		</ul>)
	}
}

export default connect(state => ({
	image: state.FileReducer.file,
	colorList: state.ColorReducer.colors
}))(Tritonizer)
