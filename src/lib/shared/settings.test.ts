import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, parseSettings } from './settings';
import {
	SETTINGS_DOCS,
	mergeSettings,
	settingsFile,
	settingsFromFile,
	settingsOverrides,
	validateSettings
} from './settings-schema';

describe('settings file', () => {
	it('has only your changes', () => {
		const s = mergeSettings(DEFAULT_SETTINGS, { pushFyi: true, dash: { staleDays: 5 } as never });
		const file = settingsFile(s);
		expect(file.settings).toEqual({ pushFyi: true, dash: { staleDays: 5 } });
		expect(settingsFromFile(JSON.stringify(file))).toEqual(file.settings);
		expect(parseSettings(JSON.stringify(file.settings))).toEqual(s);
	});

	it('drops settings that are gone', () => {
		expect(parseSettings('{"digestHour":8,"pushFyi":true}')).toEqual({
			...DEFAULT_SETTINGS,
			pushFyi: true
		});
	});

	it('refuses other files', () => {
		expect(settingsFromFile('{"hush":1,"settings":{"pushFyi":true,"nope":1}}')).toEqual({
			pushFyi: true
		});
		expect(settingsFromFile('nope')).toMatch(/not JSON/);
		expect(settingsFromFile('{"rules":[]}')).toMatch(/not a Hush settings file/);
		expect(settingsFromFile('{"hush":1,"settings":{}}')).toMatch(/no settings/);
		expect(settingsFromFile('{"hush":3,"settings":{"pushFyi":true}}')).toMatch(/newer Hush/);
	});

	it('reads a version 1 file: JSON conditions become query text', () => {
		const v1 = {
			hush: 1,
			settings: {
				rules: [
					{
						name: 'Docs',
						when: { repo: 'acme/website', label: ['docs'] },
						then: { category: 'fyi' }
					}
				],
				views: [{ id: 'web', name: 'Web', base: 'inbox', when: { repo: 'acme/web-*' } }]
			}
		};
		const patch = settingsFromFile(JSON.stringify(v1));
		expect(patch).toMatchObject({
			views: [{ id: 'web', name: 'Web', base: 'inbox', query: 'repo:acme/web-*' }]
		});
		expect(typeof patch !== 'string' && patch.categories?.[0]).toMatchObject({
			name: 'Docs',
			rule: 'repo:acme/website label:docs',
			inbox: 'fyi'
		});
		expect(settingsFile(DEFAULT_SETTINGS).hush).toBe(2);
	});
});

describe('settings schema', () => {
	it('documents every setting', () => {
		const keys = SETTINGS_DOCS.map((d) => d.key);
		for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
			if (['dash', 'menus', 'swipe', 'rows', 'alertChannels'].includes(k))
				for (const sub of Object.keys(v)) expect(keys).toContain(`${k}.${sub}`);
			else expect(keys).toContain(k);
		}
		expect(new Set(keys).size).toBe(keys.length);
	});

	it('stores nothing for the defaults', () => {
		expect(settingsOverrides(DEFAULT_SETTINGS)).toEqual({});
		expect(settingsOverrides(parseSettings('{}'))).toEqual({});
	});

	it('keeps the rest of a group', () => {
		const s = mergeSettings(DEFAULT_SETTINGS, { dash: { hideBots: false } as never });
		expect(s.dash.scope).toEqual(DEFAULT_SETTINGS.dash.scope);
		expect(settingsOverrides(s)).toEqual({ dash: { hideBots: false } });
	});

	it('checks each setting', () => {
		const check = (patch: object) =>
			validateSettings(mergeSettings(DEFAULT_SETTINGS, patch), Object.keys(patch));
		expect(check({ pushFyi: true })).toBeNull();
		expect(check({ pushFyi: 'yes' })).toMatch(/true or false/);
		expect(check({ nope: 1 })).toMatch(/Unknown setting "nope"/);
		expect(check({ dash: { nope: 1 } })).toMatch(/Unknown setting "dash.nope"/);
		expect(check({ dash: { staleDays: 0 } })).toMatch(/Stale/);
		expect(check({ reviewResolution: 'x' })).toMatch(/strict/);
		expect(check({ newCommitsAfterReview: 'changes_requested' })).toBeNull();
		expect(check({ newCommitsAfterReview: 'x' })).toMatch(/changes_requested/);
		expect(check({ views: [{ id: 'a', name: 'A', base: 'inbox', query: 'repo:' }] })).toMatch(
			/"A"/
		);
		expect(check({ rules: [] } as never)).toMatch(/Unknown setting "rules"/);
		const other = DEFAULT_SETTINGS.categories.map((c) =>
			c.id === 'other' ? { ...c, triage: 'snooze' as const, snoozeHours: 0 } : c
		);
		expect(check({ categories: other })).toMatch(/snoozeHours/);
	});
});

describe('inbox rules from before categories', () => {
	const rule = (when: string, then: object, more: object = {}) => ({ when, then, ...more });

	it('become categories first, in the same order, with the same names', () => {
		const s = parseSettings(
			JSON.stringify({
				rules: [
					rule('repo:acme/docs', { category: 'muted' }, { name: 'Docs' }),
					rule('author:renovate*', { push: false, triage: 'snooze', snoozeHours: 6 }),
					rule('repo:acme/old', { category: 'fyi' }, { enabled: false })
				]
			})
		);
		expect(s.categories.slice(0, 2)).toEqual([
			{
				id: 'rule-1',
				name: 'Docs',
				color: 'gray',
				rule: 'repo:acme/docs',
				description: '',
				inbox: 'muted',
				push: 'inherit'
			},
			{
				id: 'rule-2',
				name: 'Rule 2',
				color: 'gray',
				rule: 'author:renovate*',
				description: '',
				inbox: 'auto',
				push: 'off',
				triage: 'snooze',
				snoozeHours: 6
			}
		]);
		expect(s.categories.slice(2).map((c) => c.id)).toEqual(
			DEFAULT_SETTINGS.categories.map((c) => c.id)
		);
		expect('rules' in s).toBe(false);
	});

	it('drop rules that look at the notification, which category rules cannot do', () => {
		const s = parseSettings(
			JSON.stringify({
				rules: [
					rule('repo:acme/web needs:review', { push: false }),
					rule('event:mentioned', { category: 'action' }),
					rule('type:ci', { category: 'muted' }),
					rule('repo:acme/docs', { category: 'muted' })
				]
			})
		);
		expect(s.categories[0]).toMatchObject({ id: 'rule-4', rule: 'repo:acme/docs' });
		expect(s.categories).toHaveLength(DEFAULT_SETTINGS.categories.length + 1);
		expect(validateSettings(s, ['categories'])).toBeNull();
	});

	it('put a rule for every thread on the fallback category', () => {
		const s = parseSettings(JSON.stringify({ rules: [rule('', { category: 'fyi' })] }));
		expect(s.categories.find((c) => c.id === 'other')).toMatchObject({ inbox: 'fyi' });
		expect(s.categories).toHaveLength(DEFAULT_SETTINGS.categories.length);
	});
});

describe('swipe settings', () => {
	it('keeps the other side and list when you change one', () => {
		const s = mergeSettings(DEFAULT_SETTINGS, { swipe: { inbox: { left: 'mute' } } } as never);
		expect(s.swipe.dash).toEqual(DEFAULT_SETTINGS.swipe.dash);
		expect(validateSettings(s, ['swipe'])).toBeNull();
		const parsed = parseSettings(JSON.stringify({ swipe: { inbox: { left: 'mute' } } }));
		expect(parsed.swipe.inbox).toEqual({ right: 'done', left: 'mute' });
	});

	it('refuses unknown actions and sides', () => {
		const check = (swipe: unknown) =>
			validateSettings({ ...DEFAULT_SETTINGS, swipe } as never, ['swipe']);
		expect(check({ inbox: { left: 'mute', right: 'done' } })).toBeNull();
		expect(check({ inbox: { left: 'merge', right: 'done' } })).toMatch(/swipe.inbox.left/);
		expect(check({ inbox: { up: 'done' } })).toMatch(/left.*right/);
		expect(check({ nope: {} })).toMatch(/swipe.nope/);
	});
});
