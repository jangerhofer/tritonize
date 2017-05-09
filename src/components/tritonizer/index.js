import React, {Component} from 'react'
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

export default class Tritonizer extends Component {

	render() {
		console.log(this.props.image)
		const colorPerms = Combinatorics.permutation(colorList).toArray()
		console.log(colorPerms)
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
