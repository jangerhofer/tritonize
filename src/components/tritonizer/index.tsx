import React from 'react'
import { useSelector } from 'react-redux'
import Combinatorics from 'js-combinatorics'

import Canvas from './canvas.tsx'
import { RootState } from '../../store/index'

function Tritonizer() {
	const image = useSelector((state: RootState) => state.file.file)
	const color_list = useSelector((state: RootState) => state.color.colors)

	if (color_list.length <= 1) {
		return (
			<p>
				Please choose more than one color; otherwise, your image will
				show up as a solid rectangle.
			</p>
		)
	}

	const color_perms = Combinatorics.permutationCombination(color_list)
		.toArray()
		.filter((list) => list.length > 1)
	const canvas_array = []
	let id_no = 0
	while (id_no < color_perms.length) {
		canvas_array.push(
			<Canvas
				key={id_no}
				image={image}
				id={id_no}
				colorList={color_perms[id_no]}
			/>
		)
		id_no++
	}
	return <ul>{canvas_array}</ul>
}

export default Tritonizer
