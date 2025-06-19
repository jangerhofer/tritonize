import React from 'react'
import { useSelector } from 'react-redux'
import Combinatorics from 'js-combinatorics'

import Canvas from './canvas.tsx'
import { RootState } from '../../store/index'

function Tritonizer() {
	const image = useSelector((state: RootState) => state.file.file)
	const colorList = useSelector((state: RootState) => state.color.colors)

	if (colorList.length <= 1) {
		return <p>Please choose more than one color; otherwise, your image will show up as a solid rectangle.</p>
	}
	
	const colorPerms = Combinatorics.permutationCombination(colorList).toArray().filter(list => list.length > 1)
	const canvasArray = []
	let idNo = 0
	while (idNo < colorPerms.length) {
		canvasArray.push(<Canvas key={idNo} image={image} id={idNo} colorList={colorPerms[idNo]}/>)
		idNo++
	}
	return (<ul>
		{canvasArray}
	</ul>)
}

export default Tritonizer
