import { useSelector } from 'react-redux'

import Canvas from './canvas.tsx'
import { RootState } from '../../store/index'

function generate_all_partial_permutations<T>(arr: T[]): T[][] {
	const result: T[][] = []

	function permute(items: T[]): T[][] {
		if (items.length <= 1) return [items]
		const perms: T[][] = []
		for (let i = 0; i < items.length; i++) {
			const rest = [...items.slice(0, i), ...items.slice(i + 1)]
			const restPerms = permute(rest)
			for (const perm of restPerms) {
				perms.push([items[i], ...perm])
			}
		}
		return perms
	}

	function combine(items: T[], size: number): T[][] {
		if (size === 1) return items.map((item) => [item])
		if (size === items.length) return [items]
		const combos: T[][] = []
		for (let i = 0; i <= items.length - size; i++) {
			const head = items[i]
			const rest = items.slice(i + 1)
			const restCombos = combine(rest, size - 1)
			for (const combo of restCombos) {
				combos.push([head, ...combo])
			}
		}
		return combos
	}

	for (let size = 1; size <= arr.length; size++) {
		const combinations = combine(arr, size)
		for (const combo of combinations) {
			const permutations = permute(combo)
			result.push(...permutations)
		}
	}

	return result
}

function Tritonizer() {
	const image = useSelector((state: RootState) => state.file.file)
	const color_list = useSelector((state: RootState) => state.color.colors)
	const blur_amount = useSelector(
		(state: RootState) => state.color.blur_amount
	)

	if (color_list.length <= 1) {
		return (
			<p>
				Please choose more than one color; otherwise, your image will
				show up as a solid rectangle.
			</p>
		)
	}

	const color_perms = generate_all_partial_permutations(color_list).filter(
		(list) => list.length > 1
	)
	const canvas_array = []
	let id_no = 0
	while (id_no < color_perms.length) {
		canvas_array.push(
			<Canvas
				key={id_no}
				image={image}
				id={id_no}
				color_list={color_perms[id_no]}
				blur_amount={blur_amount}
			/>
		)
		id_no++
	}
	return <ul>{canvas_array}</ul>
}

export default Tritonizer
