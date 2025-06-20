import { splitProps, type Component } from 'solid-js'
import { cn } from '@/lib/utils'

export interface SliderProps {
	value: number[]
	onChange?: (value: number[]) => void
	min?: number
	max?: number
	step?: number
	class?: string
}

const Slider: Component<SliderProps> = (props) => {
	const [local, others] = splitProps(props, ['class', 'onChange', 'value'])

	const handleInput = (e: Event) => {
		const target = e.target as HTMLInputElement
		const newValue = parseFloat(target.value)
		local.onChange?.([newValue])
	}

	return (
		<div
			class={cn(
				'relative flex w-full touch-none select-none items-center',
				local.class
			)}
		>
			<input
				type="range"
				value={local.value[0] || 0}
				onInput={handleInput}
				class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
				{...others}
			/>
		</div>
	)
}

export { Slider }
