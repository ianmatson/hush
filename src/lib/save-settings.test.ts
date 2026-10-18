import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from './shared/settings';
import { mergeSettings, type SettingsPatch } from './shared/settings-schema';
import type { MeDTO, Settings } from './shared/types';

vi.mock('$app/environment', () => ({ browser: false }));
const api = vi.hoisted(() => ({ me: vi.fn(), saveSettings: vi.fn(), replaceSettings: vi.fn() }));
vi.mock('$lib/api', () => ({ api, ApiError: class extends Error {} }));
vi.mock('svelte-sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { applySettings, togglePushFact } = await import('./save-settings');
const { cachedSettings, keys, meQuery, queryClient } = await import('./queries');

interface PendingAnswer {
	patch: SettingsPatch;
	answer: () => void;
	refuse: (message: string) => void;
}

let server: Settings;
let pending: PendingAnswer[];

const flush = () => new Promise((resolve) => setTimeout(resolve));

beforeEach(() => {
	vi.clearAllMocks();
	server = DEFAULT_SETTINGS;
	pending = [];
	queryClient.clear();
	queryClient.setQueryData(keys.me, { login: 'me', settings: server } as MeDTO);
	api.me.mockImplementation(async () => ({ login: 'me', settings: server }));
	api.saveSettings.mockImplementation(
		(patch: SettingsPatch) =>
			new Promise((resolve, reject) =>
				pending.push({
					patch,
					answer: () => {
						server = mergeSettings(server, patch);
						resolve({ settings: server });
					},
					refuse: (message) => reject(new Error(message))
				})
			)
	);
});

describe('applySettings', () => {
	it('keeps the first change when a second one comes before the first save returns', async () => {
		const first = togglePushFact('mentioned', false);
		const second = togglePushFact('replied', false);
		expect(cachedSettings()?.pushFacts).not.toContain('mentioned');
		expect(cachedSettings()?.pushFacts).not.toContain('replied');

		await flush();
		expect(pending).toHaveLength(1);
		pending[0].answer();
		await flush();
		expect(pending).toHaveLength(2);
		expect(pending[1].patch.pushFacts).not.toContain('mentioned');
		pending[1].answer();

		expect(await first).toBe(true);
		expect(await second).toBe(true);
		expect(server.pushFacts).not.toContain('mentioned');
		expect(server.pushFacts).not.toContain('replied');
		expect(cachedSettings()?.pushFacts).toEqual(server.pushFacts);
	});

	it('keeps a change that is still saving when an older answer to a refetch comes in', async () => {
		const saving = applySettings({ pushWhileOpen: true });
		await queryClient.fetchQuery({ ...meQuery(), staleTime: 0 });
		expect(cachedSettings()?.pushWhileOpen).toBe(true);

		await flush();
		pending[0].answer();
		await saving;
		expect(cachedSettings()?.pushWhileOpen).toBe(true);
	});

	it('changes only the given keys of a group', async () => {
		const saving = applySettings({ dash: { hideBots: !DEFAULT_SETTINGS.dash.hideBots } });
		expect(cachedSettings()?.dash).toEqual({
			...DEFAULT_SETTINGS.dash,
			hideBots: !DEFAULT_SETTINGS.dash.hideBots
		});
		await flush();
		pending[0].answer();
		await saving;
	});

	it('throws the refusal and gets the settings from the server again', async () => {
		const saving = applySettings({ pushWhileOpen: true });
		await flush();
		pending[0].refuse('Nope');
		await expect(saving).rejects.toThrow('Nope');
		expect(queryClient.getQueryState(keys.me)?.isInvalidated).toBe(true);

		await queryClient.fetchQuery({ ...meQuery(), staleTime: 0 });
		expect(cachedSettings()?.pushWhileOpen).toBe(false);
	});

	it('refuses what the server would refuse, before it sends anything', async () => {
		await expect(applySettings({ pushDigestMinutes: 1 })).rejects.toThrow(/pushDigestMinutes/);
		expect(api.saveSettings).not.toHaveBeenCalled();
		expect(cachedSettings()?.pushDigestMinutes).toBe(DEFAULT_SETTINGS.pushDigestMinutes);
	});
});
