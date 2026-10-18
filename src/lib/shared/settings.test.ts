import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, parseSettings } from './settings';
import {
	SETTINGS_DOCS,
	SETTINGS_SECTIONS,
	defaultOf,
	mergeSettings,
	settingsChanges,
	settingsFile,
	settingsFromFile,
	settingsOverrides,
	validateAboutConditions,
	validateSettings
} from './settings-schema';
import { MAX_SMART_CONDITIONS } from './decisions';

describe('settings file', () => {
	it('has only your changes', () => {
		const s = mergeSettings(DEFAULT_SETTINGS, {
			pushWhileOpen: true,
			dash: { staleDays: 5 }
		});
		const file = settingsFile(s);
		expect(file.settings).toEqual({ pushWhileOpen: true, dash: { staleDays: 5 } });
		expect(settingsFromFile(JSON.stringify(file))).toEqual(file.settings);
		expect(parseSettings(JSON.stringify(file.settings))).toEqual(s);
	});

	it('drops settings that are gone', () => {
		expect(parseSettings('{"digestHour":8,"pushWhileOpen":true}')).toEqual({
			...DEFAULT_SETTINGS,
			pushWhileOpen: true
		});
	});

	it('drops dashboard settings that are gone, so the rest can still be saved', () => {
		const stored = '{"dash":{"scope":"archived:false org:posthog","pr":{},"hideBots":false}}';
		const s = parseSettings(stored);
		expect(s.dash).toEqual({ ...DEFAULT_SETTINGS.dash, hideBots: false });
		expect(validateSettings(mergeSettings(s, { dash: s.dash }), ['dash'])).toBeNull();
	});

	it('drops swipe actions and key commands that are gone', () => {
		const s = parseSettings(
			JSON.stringify({
				swipe: { dash: { right: 'hide', left: 'read' } },
				keys: { 'dash.hide': ['z'], 'dash.read': ['y'] }
			})
		);
		expect(s.swipe.dash).toEqual({ right: 'snooze', left: 'read' });
		expect(s.keys).toEqual({ 'dash.read': ['y'] });
		expect(validateSettings(s, ['swipe', 'keys'])).toBeNull();
	});

	it('refuses other files', () => {
		expect(settingsFromFile('{"hush":2,"settings":{"pushWhileOpen":true,"nope":1}}')).toEqual({
			pushWhileOpen: true
		});
		expect(settingsFromFile('nope')).toMatch(/not JSON/);
		expect(settingsFromFile('{"rules":[]}')).toMatch(/not a Hush settings file/);
		expect(settingsFromFile('{"hush":2,"settings":{}}')).toMatch(/no settings/);
		expect(settingsFromFile('{"hush":1,"settings":{"pushWhileOpen":true}}')).toMatch(/older Hush/);
		expect(settingsFromFile('{"hush":3,"settings":{"pushWhileOpen":true}}')).toMatch(/newer Hush/);
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
		const s = mergeSettings(DEFAULT_SETTINGS, { dash: { hideBots: false } });
		expect(s.dash.staleDays).toEqual(DEFAULT_SETTINGS.dash.staleDays);
		expect(settingsOverrides(s)).toEqual({ dash: { hideBots: false } });
	});

	it('checks each setting', () => {
		const check = (patch: object) =>
			validateSettings(mergeSettings(DEFAULT_SETTINGS, patch), Object.keys(patch));
		expect(check({ pushWhileOpen: true })).toBeNull();
		expect(check({ pushWhileOpen: 'yes' })).toMatch(/true or false/);
		expect(check({ nope: 1 })).toMatch(/Unknown setting "nope"/);
		expect(check({ dash: { nope: 1 } })).toMatch(/Unknown setting "dash.nope"/);
		expect(check({ dash: { staleDays: 0 } })).toMatch(/Stale/);
		expect(check({ reviewResolution: 'strict' } as never)).toMatch(
			/Unknown setting "reviewResolution"/
		);
		expect(check({ views: [{ id: 'a', name: 'A', searches: [] }] })).toMatch(/"A"/);
		expect(check({ rules: [] } as never)).toMatch(/Unknown setting "rules"/);
		expect(check({ categoryGroups: [{ id: 'a', name: 'A', categories: [] }] })).toBeNull();
	});
});

describe('category groups', () => {
	it('replace the categories and tags of older settings with the defaults', () => {
		const s = parseSettings(
			JSON.stringify({
				categories: [{ id: 'bugs', name: 'Bugs', color: 'red', rule: '', description: '' }],
				tags: [{ id: 'quick', name: 'Quick', color: 'green', rule: 'size:<50' }],
				rules: [{ when: 'repo:acme/docs', then: { category: 'muted' } }]
			})
		);
		expect(s).toEqual(DEFAULT_SETTINGS);
	});

	it('drop row parts that are gone', () => {
		const s = parseSettings(JSON.stringify({ rows: { pr: ['labels', 'markNames', 'tags'] } }));
		expect(s.rows.pr).toEqual(['labels']);
	});
});

describe('swipe settings', () => {
	it('keeps the other side when you change one, and drops the inbox swipes', () => {
		const s = mergeSettings(DEFAULT_SETTINGS, { swipe: { dash: { left: 'read' } } } as never);
		expect(validateSettings(s, ['swipe'])).toBeNull();
		expect(parseSettings(JSON.stringify({ swipe: s.swipe })).swipe.dash).toEqual({
			right: 'snooze',
			left: 'read'
		});
		const parsed = parseSettings(JSON.stringify({ swipe: { inbox: { left: 'mute' } } }));
		expect(parsed.swipe).toEqual(DEFAULT_SETTINGS.swipe);
	});

	it('refuses unknown actions and sides', () => {
		const check = (swipe: unknown) =>
			validateSettings({ ...DEFAULT_SETTINGS, swipe } as never, ['swipe']);
		expect(check({ dash: { left: 'mute', right: 'snooze' } })).toBeNull();
		expect(check({ dash: { left: 'merge', right: 'snooze' } })).toMatch(/swipe.dash.left/);
		expect(check({ dash: { up: 'snooze' } })).toMatch(/left.*right/);
		expect(check({ inbox: {} })).toMatch(/swipe.inbox/);
	});
});

describe('settingsChanges', () => {
	it('has only the settings that changed', () => {
		const base = { pushWhileOpen: false, views: DEFAULT_SETTINGS.views };
		expect(settingsChanges(base, { ...base, pushWhileOpen: true })).toEqual({
			pushWhileOpen: true
		});
		expect(settingsChanges(base, base)).toEqual({});
	});

	it('has only the keys of a group that changed, so other changes to the group stay', () => {
		const base = { dash: DEFAULT_SETTINGS.dash };
		const next = { dash: { ...DEFAULT_SETTINGS.dash, excludedTeams: ['acme/everyone'] } };
		const patch = settingsChanges(base, next);
		expect(patch).toEqual({ dash: { excludedTeams: ['acme/everyone'] } });
		const changedElsewhere = mergeSettings(DEFAULT_SETTINGS, {
			dash: { hideBots: !DEFAULT_SETTINGS.dash.hideBots }
		});
		expect(mergeSettings(changedElsewhere, patch).dash).toEqual({
			...changedElsewhere.dash,
			excludedTeams: ['acme/everyone']
		});
	});
});

describe('about: conditions', () => {
	const PER_GROUP = 15;
	const topic = (i: number) => ({
		id: `topic-${i}`,
		name: `Topic ${i}`,
		color: 'blue' as const,
		rule: `about:"topic ${i}"`,
		description: ''
	});
	const groupsWith = (count: number) =>
		Array.from({ length: Math.ceil(count / PER_GROUP) }, (_, g) => ({
			id: `topics-${g}`,
			name: `Topics ${g}`,
			categories: Array.from({ length: Math.min(PER_GROUP, count - g * PER_GROUP) }, (_, i) =>
				topic(g * PER_GROUP + i)
			)
		}));

	it(`allows up to ${MAX_SMART_CONDITIONS} different conditions, the same check as a save`, () => {
		const atLimit = { categoryGroups: groupsWith(MAX_SMART_CONDITIONS) };
		const overLimit = { categoryGroups: groupsWith(MAX_SMART_CONDITIONS + 1) };
		expect(validateAboutConditions(atLimit)).toBeNull();
		expect(validateAboutConditions(overLimit)).toMatch(/about: conditions/);
		expect(validateSettings(mergeSettings(DEFAULT_SETTINGS, overLimit), ['categoryGroups'])).toBe(
			validateAboutConditions(overLimit)
		);
	});
});

describe('defaultOf', () => {
	it('reads a setting and a key of a group', () => {
		expect(defaultOf('pushRepeat')).toBe(DEFAULT_SETTINGS.pushRepeat);
		expect(defaultOf('dash.hideBots')).toBe(DEFAULT_SETTINGS.dash.hideBots);
	});
});

describe('settings sections', () => {
	it('names the page of every documented setting', () => {
		for (const d of SETTINGS_DOCS) if (d.page) expect(SETTINGS_SECTIONS[d.page].label).toBeTruthy();
	});
});
