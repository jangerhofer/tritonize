import {
	type Component,
	createSignal,
	createMemo,
	onMount,
	onCleanup,
	For,
	Show,
} from 'solid-js'
import Canvas from './canvas'
import { store } from '../../store/store'

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

const Tritonizer: Component = () => {
	const [visible_indices, set_visible_indices] = createSignal<Set<number>>(
		new Set()
	)
	let ul_ref: HTMLUListElement | undefined

	const color_perms = createMemo(() =>
		generate_all_partial_permutations(store.state.color.colors).filter(
			(list) => list.length > 1
		)
	)

	onMount(() => {
		if (!ul_ref) return

		const observer = new IntersectionObserver(
			(entries) => {
				const updates = new Set(visible_indices())
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
			const listItems = ul_ref?.querySelectorAll('li')
			listItems?.forEach((li) => observer.observe(li))
		}, 0)

		onCleanup(() => {
			clearTimeout(timer)
			observer.disconnect()
		})
	})

	return (
		<Show
			when={store.state.color.colors.length > 1}
			fallback={
				<p>
					Please choose more than one color; otherwise, your image
					will show up as a solid rectangle.
				</p>
			}
		>
			<Show when={store.state.file.file}>
				<ul ref={ul_ref}>
					<For each={color_perms()}>
						{(color_perm, index) => (
							<Canvas
								image={store.state.file.file!}
								id={index()}
								color_list={color_perm}
								blur_amount={store.state.color.blur_amount}
								is_visible={visible_indices().has(index())}
							/>
						)}
					</For>
				</ul>
			</Show>
		</Show>
	)
}

export default Tritonizer
