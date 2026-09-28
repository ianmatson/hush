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
		const s = mergeSettings(DEFAULT_SETTINGS, { push: false, staleDays: 5 });
		const file = settingsFile(s);
		expect(file.settings).toEqual({ push: false, staleDays: 5 });
		expect(settingsFromFile(JSON.stringify(file))).toEqual(file.settings);
		expect(parseSettings(JSON.stringify(file.settings))).toEqual(s);
	});

	it('drops settings that are gone', () => {
		expect(parseSettings('{"digestHour":8,"push":false}')).toEqual({
			...DEFAULT_SETTINGS,
			push: false
		});
	});

	it('refuses other files, and files from the older Hush', () => {
		expect(settingsFromFile('{"hush":2,"settings":{"push":false,"nope":1}}')).toEqual({
			push: false
		});
		expect(settingsFromFile('nope')).toMatch(/not JSON/);
		expect(settingsFromFile('{"rules":[]}')).toMatch(/not a Hush settings file/);
		expect(settingsFromFile('{"hush":1,"settings":{"pushFyi":true}}')).toMatch(/older Hush/);
		expect(settingsFromFile('{"hush":2,"settings":{}}')).toMatch(/no settings/);
	});
});

describe('settings schema', () => {
	it('documents every setting', () => {
		const keys = SETTINGS_DOCS.map((d) => d.key);
		for (const k of Object.keys(DEFAULT_SETTINGS)) expect(keys).toContain(k);
		expect(new Set(keys).size).toBe(keys.length);
	});

	it('stores nothing for the defaults', () => {
		expect(settingsOverrides(DEFAULT_SETTINGS)).toEqual({});
		expect(settingsOverrides(parseSettings('{}'))).toEqual({});
	});

	it('checks each setting', () => {
		const check = (patch: object) =>
			validateSettings(mergeSettings(DEFAULT_SETTINGS, patch), Object.keys(patch));
		expect(check({ push: true })).toBeNull();
		expect(check({ push: 'yes' })).toMatch(/true or false/);
		expect(check({ nope: 1 })).toMatch(/Unknown setting "nope"/);
		expect(check({ staleDays: 0 })).toMatch(/1 to 60/);
		expect(check({ reviewResolution: 'x' })).toMatch(/strict/);
		expect(check({ saved: [{ id: 'a', name: 'A', query: 'needs:nope' }] })).toMatch(/Unknown/);
		expect(check({ saved: [{ id: 'a', name: 'A', query: 'repo:acme/* in:turn' }] })).toBeNull();
		expect(check({ searches: [{ id: 'x', name: 'X', query: '', enabled: true }] })).toMatch(
			/1–256/
		);
	});
});
