import { useSelector } from 'react-redux'
import { useState, useEffect, useRef, useMemo } from 'react'

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

	const [visible_indices, set_visible_indices] = useState<Set<number>>(
		new Set()
	)
	const ul_ref = useRef<HTMLUListElement>(null)

	const color_perms = useMemo(
		() =>
			generate_all_partial_permutations(color_list).filter(
				(list) => list.length > 1
			),
		[color_list]
	)

	useEffect(() => {
		const ul = ul_ref.current
		if (!ul) return

		const observer = new IntersectionObserver(
			(entries) => {
				const updates = new Set(visible_indices)
				let hasChanges = false

				entries.forEach((entry) => {
					const index = parseInt(
						(entry.target as HTMLElement).dataset.index || '0'
					)
					if (entry.isIntersecting && !updates.has(index)) {
						updates.add(index)
						hasChanges = true
					} else if (!entry.isIntersecting && updates.has(index)) {
						updates.delete(index)
						hasChanges = true
					}
				})

				if (hasChanges) {
					set_visible_indices(updates)
				}
			},
			{ rootMargin: '50px' }
		)

		// Use setTimeout to ensure DOM is ready
		const timer = setTimeout(() => {
			const listItems = ul.querySelectorAll('li')
			listItems.forEach((li) => observer.observe(li))
		}, 0)

		return () => {
			clearTimeout(timer)
			observer.disconnect()
		}
	}, [color_perms.length])

	if (color_list.length <= 1) {
		return (
			<p>
				Please choose more than one color; otherwise, your image will
				show up as a solid rectangle.
			</p>
		)
	}

	if (!image) {
		return null
	}

	return (
		<ul ref={ul_ref}>
			{color_perms.map((color_perm, index) => (
				<Canvas
					key={index}
					image={image}
					id={index}
					color_list={color_perm}
					blur_amount={blur_amount}
					is_visible={visible_indices.has(index)}
				/>
			))}
		</ul>
	)
}

export default Tritonizer
