import React, {Component} from 'react'
import {connect} from 'react-redux'
import Combinatorics from 'js-combinatorics'

import Canvas from './canvas'

const colorList = [
                [198, 12, 48],
                [255, 255, 255]
              //  [0, 0, 0],
            //    [228, 219, 204],
              //  [60, 74, 198],
                // [79, 243, 222]
]

class Tritonizer extends Component {

	render() {
		const colorPerms = Combinatorics.permutation(colorList).toArray()
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
  image : state.FileReducer.file
}))(Tritonizer)
