const DEFAULT_ARMED_MS = 4000;

export class ArmedConfirm {
	armed = $state<string | null>(null);
	#timeoutMs: number;
	#timer: ReturnType<typeof setTimeout> | undefined;

	constructor(timeoutMs = DEFAULT_ARMED_MS) {
		this.#timeoutMs = timeoutMs;
	}

	isArmed(key: string) {
		return this.armed === key;
	}

	arm(key: string) {
		this.armed = key;
		clearTimeout(this.#timer);
		this.#timer = setTimeout(() => this.disarm(), this.#timeoutMs);
	}

	disarm() {
		this.dispose();
		this.armed = null;
	}

	dispose() {
		clearTimeout(this.#timer);
		this.#timer = undefined;
	}
}
