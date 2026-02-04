import { format } from "date-fns";
import { createSignal, onCleanup } from "solid-js";

export default function CurrentTime() {
	const [time, setTime] = createSignal(new Date());

	const timer = setInterval(() => {
		setTime(new Date());
	}, 1000);

	onCleanup(() => clearInterval(timer));

	return (
		<div>
			<span class="tw:pr-2 tw:text-[#c4f3fe] tw:text-sm tw:font-d-din">
				{format(new Date(), "yyyy-MM-dd")}
			</span>
			<span class="tw:pr-2 tw:text-[#c4f3fe] tw:text-sm tw:font-d-din">
				{format(time(), "HH:mm:ss")}
			</span>
		</div>
	);
}
