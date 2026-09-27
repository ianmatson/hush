import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, parseSettings, settingsFile, settingsFromFile } from './settings';

describe('settings file', () => {
	it('round-trips', () => {
		const text = JSON.stringify(settingsFile(DEFAULT_SETTINGS));
		expect(settingsFromFile(text)).toEqual(DEFAULT_SETTINGS);
	});

	it('keeps only known settings', () => {
		const text = JSON.stringify({ hush: 1, settings: { pushFyi: true, nope: 1 } });
		expect(settingsFromFile(text)).toEqual({ pushFyi: true });
	});

	it('drops settings that are gone', () => {
		expect(parseSettings('{"digestHour":8,"pushFyi":true}')).toEqual({
			...DEFAULT_SETTINGS,
			pushFyi: true
		});
	});

	it('refuses other files', () => {
		expect(settingsFromFile('nope')).toMatch(/not JSON/);
		expect(settingsFromFile('{"rules":[]}')).toMatch(/not a Hush settings file/);
		expect(settingsFromFile('{"hush":1,"settings":{}}')).toMatch(/no settings/);
	});
});
