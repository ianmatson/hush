import { beforeNavigate } from '$app/navigation';
import type { BeforeNavigate } from '@sveltejs/kit';

const LEAVE_PROMPT = 'Leave without saving your changes?';
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const copyOf = <T>(value: T): T => JSON.parse(JSON.stringify(value));

export interface SettingsDraftOptions<Saved, Draft> {
	saved: () => Saved | undefined;
	save: (next: Saved, base: Saved) => Promise<boolean>;
	toDraft?: (saved: Saved) => Draft;
	fromDraft?: (draft: Draft) => Saved;
}

export interface SettingsDraftControls {
	readonly dirty: boolean;
	readonly saving: boolean;
	save: () => Promise<void>;
	discard: () => void;
}

type LeavingNavigation = Pick<BeforeNavigate, 'type' | 'from' | 'to' | 'cancel'>;

export class SettingsDraft<Saved, Draft = Saved> implements SettingsDraftControls {
	draft = $state<Draft>();
	saving = $state(false);
	#base = $state.raw<Saved>();
	#saved: () => Saved | undefined;
	#send: (next: Saved, base: Saved) => Promise<boolean>;
	#toDraft: (saved: Saved) => Draft;
	#fromDraft: (draft: Draft) => Saved;
	dirty = $derived.by(() => {
		const edited = this.#edited;
		return this.#base !== undefined && edited !== undefined && !same(edited, this.#base);
	});

	constructor({
		saved,
		save,
		toDraft = (value) => copyOf(value) as unknown as Draft,
		fromDraft = (draft) => draft as unknown as Saved
	}: SettingsDraftOptions<Saved, Draft>) {
		this.#saved = saved;
		this.#send = save;
		this.#toDraft = toDraft;
		this.#fromDraft = fromDraft;
	}

	get #edited(): Saved | undefined {
		return this.draft === undefined ? undefined : this.#fromDraft(this.draft);
	}

	#load(value: Saved) {
		this.#base = value;
		this.draft = this.#toDraft(value);
	}

	reloadWhileClean() {
		const current = this.#saved();
		if (current !== undefined && !this.dirty && !same(current, this.#base)) this.#load(current);
	}

	save = async () => {
		const edited = this.#edited;
		const base = this.#base;
		if (edited === undefined || base === undefined || this.saving) return;
		const snapshot = copyOf(edited);
		this.saving = true;
		try {
			if (await this.#send(snapshot, base)) this.#base = snapshot;
		} finally {
			this.saving = false;
		}
	};

	discard = () => {
		const current = this.#saved();
		if (current !== undefined) this.#load(current);
	};

	guardLeaving = (nav: LeavingNavigation) => {
		const staysOnPage = nav.to?.url.pathname === nav.from?.url.pathname;
		if (!this.dirty || staysOnPage) return;
		if (nav.type === 'leave') nav.cancel();
		else if (!confirm(LEAVE_PROMPT)) nav.cancel();
	};
}

export function createSettingsDraft<Saved, Draft = Saved>(
	options: SettingsDraftOptions<Saved, Draft>
): SettingsDraft<Saved, Draft> {
	const draft = new SettingsDraft(options);
	$effect.pre(() => draft.reloadWhileClean());
	beforeNavigate(draft.guardLeaving);
	return draft;
}
