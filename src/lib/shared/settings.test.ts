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

	it('drops settings Hush no longer has, such as inbox rules and views', () => {
		const old = {
			hush: 2,
			settings: {
				rules: [{ when: 'repo:acme/*', then: { category: 'fyi' } }],
				views: [],
				botsAreFyi: false
			}
		};
		expect(settingsFromFile(JSON.stringify(old))).toEqual({ botsAreFyi: false });
		expect(settingsFile(DEFAULT_SETTINGS).hush).toBe(2);
	});
});

describe('settings schema', () => {
	it('documents every setting', () => {
		const keys = SETTINGS_DOCS.map((d) => d.key);
		for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
			if (k === 'dash' || k === 'menus' || k === 'swipe')
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
		expect(check({ tags: [{ id: 'a', name: 'A', color: 'blue', rule: 'repo:' }] })).toMatch(/"A"/);
		expect(
			check({ tags: [{ id: 'a', name: 'A', color: 'blue', rule: 'repo:acme/*' }] })
		).toBeNull();
		expect(check({ rules: [] })).toMatch(/Unknown setting "rules"/);
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
