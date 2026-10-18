import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('$app/navigation', () => ({ beforeNavigate: vi.fn() }));

const { SettingsDraft } = await import('./settings-draft.svelte');

interface Filters {
	name: string;
	hideBots: boolean;
}

function draftOf(server: { current: Filters }, save = vi.fn(async () => true)) {
	const draft = new SettingsDraft<Filters>({ saved: () => server.current, save });
	draft.reloadWhileClean();
	return { draft, save };
}

const editing = (draft: { draft: Filters | undefined }) => draft.draft!;

describe('SettingsDraft', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('loads the saved value, and loads it again while there is nothing to save', () => {
		const server = { current: { name: 'Mine', hideBots: false } };
		const { draft } = draftOf(server);
		expect(draft.draft).toEqual(server.current);
		expect(draft.dirty).toBe(false);

		server.current = { ...server.current, hideBots: true };
		draft.reloadWhileClean();
		expect(editing(draft).hideBots).toBe(true);
	});

	it('keeps your edits when the saved value changes, until you discard them', () => {
		const server = { current: { name: 'Mine', hideBots: false } };
		const { draft } = draftOf(server);
		editing(draft).name = 'Reviews';
		server.current = { ...server.current, hideBots: true };
		draft.reloadWhileClean();
		expect(editing(draft)).toEqual({ name: 'Reviews', hideBots: false });
		expect(draft.dirty).toBe(true);

		draft.discard();
		expect(editing(draft)).toEqual(server.current);
		expect(draft.dirty).toBe(false);
	});

	it('saves what you had when you pressed Save; what you type during the save stays unsaved', async () => {
		const server = { current: { name: 'Mine', hideBots: false } };
		let answer: (saved: boolean) => void = () => {};
		const save = vi.fn(() => new Promise<boolean>((resolve) => (answer = resolve)));
		const { draft } = draftOf(server, save);

		editing(draft).name = 'Reviews';
		const saving = draft.save();
		expect(draft.saving).toBe(true);
		editing(draft).name = 'Reviews 2';
		answer(true);
		await saving;

		expect(save).toHaveBeenCalledWith(
			{ name: 'Reviews', hideBots: false },
			{ name: 'Mine', hideBots: false }
		);
		expect(draft.saving).toBe(false);
		expect(draft.dirty).toBe(true);
	});

	it('does not discard while a save is in flight', async () => {
		const server = { current: { name: 'Mine', hideBots: false } };
		let answer: (saved: boolean) => void = () => {};
		const save = vi.fn(() => new Promise<boolean>((resolve) => (answer = resolve)));
		const { draft } = draftOf(server, save);

		editing(draft).name = 'Reviews';
		const saving = draft.save();
		draft.discard();
		expect(editing(draft).name).toBe('Reviews');
		answer(true);
		await saving;
	});

	it('saves only your edits on top of what another tab saved meanwhile', async () => {
		type Views = { views: { id: string; name: string }[] };
		const server: { current: Views } = {
			current: {
				views: [
					{ id: 'mine', name: 'Mine' },
					{ id: 'theirs', name: 'Theirs' }
				]
			}
		};
		const save = vi.fn(async () => true);
		const draft = new SettingsDraft<Views>({ saved: () => server.current, save });
		draft.reloadWhileClean();
		draft.draft!.views[0].name = 'Mine, renamed';
		server.current = { views: [{ id: 'mine', name: 'Mine' }] };

		await draft.save();

		const kept = { views: [{ id: 'mine', name: 'Mine, renamed' }] };
		expect(save).toHaveBeenCalledWith(kept, server.current);
		expect(draft.draft).toEqual(kept);
		expect(draft.dirty).toBe(false);
	});

	it('stays unsaved when the save fails', async () => {
		const server = { current: { name: 'Mine', hideBots: false } };
		const { draft } = draftOf(
			server,
			vi.fn(async () => false)
		);
		editing(draft).name = 'Reviews';
		await draft.save();
		expect(draft.dirty).toBe(true);
	});

	describe('when you leave the page', () => {
		const nav = (type: 'leave' | 'link', toPath: string | null) => ({
			type,
			from: { url: new URL('https://app.test/settings/views') },
			to: toPath ? { url: new URL(`https://app.test${toPath}`) } : null,
			cancel: vi.fn()
		});

		function dirtyDraft() {
			const { draft } = draftOf({ current: { name: 'Mine', hideBots: false } });
			editing(draft).name = 'Reviews';
			return draft;
		}

		it('lets the browser ask when the tab closes or reloads', () => {
			const confirm = vi.fn(() => true);
			vi.stubGlobal('confirm', confirm);
			const closing = nav('leave', null);
			dirtyDraft().guardLeaving(closing as never);
			expect(closing.cancel).toHaveBeenCalled();
			expect(confirm).not.toHaveBeenCalled();
		});

		it('asks before a link to another page, and stays when you say no', () => {
			vi.stubGlobal(
				'confirm',
				vi.fn(() => false)
			);
			const link = nav('link', '/settings/general');
			dirtyDraft().guardLeaving(link as never);
			expect(link.cancel).toHaveBeenCalled();
		});

		it('does not ask for a link to the same page, or when there is nothing to save', () => {
			const confirm = vi.fn(() => false);
			vi.stubGlobal('confirm', confirm);
			const samePage = nav('link', '/settings/views?new=1');
			dirtyDraft().guardLeaving(samePage as never);
			const { draft: clean } = draftOf({ current: { name: 'Mine', hideBots: false } });
			const otherPage = nav('link', '/settings/general');
			clean.guardLeaving(otherPage as never);
			expect(confirm).not.toHaveBeenCalled();
			expect(samePage.cancel).not.toHaveBeenCalled();
			expect(otherPage.cancel).not.toHaveBeenCalled();
		});
	});
});
