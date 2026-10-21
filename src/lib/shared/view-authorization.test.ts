import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from './settings';
import { queryError } from './query';
import { authorizationJson, fingerprintView, settingsAuthorization } from './view-authorization';
import type { Settings } from './types';

const scope = (settings: Settings) => authorizationJson(settingsAuthorization(settings));

describe('saved-view authorization projection', () => {
	it('ignores known presentation fields, equivalent closed defaults, and object key order', async () => {
		const before = structuredClone(DEFAULT_SETTINGS);
		const after = structuredClone(before);
		Object.assign(after.views[0], {
			name: 'Renamed',
			sort: { by: 'title', dir: 'asc', turnFirst: false },
			pushNew: true,
			keepClosed: true,
			groupBy: 'repo'
		});
		after.keys = { next: ['j'] };
		after.pushWhileOpen = true;
		expect(scope(after)).toBe(scope(before));
		expect(await fingerprintView(after.views[0])).toBe(await fingerprintView(before.views[0]));
	});

	it.each(['searches', 'keepClosed', 'groupBy', 'sections'] as const)(
		'retains authority from %s',
		(field) => {
			const before = structuredClone(DEFAULT_SETTINGS);
			const after = structuredClone(before);
			Object.assign(after.views[0], {
				[field]: {
					searches: ['is:open'],
					keepClosed: false,
					groupBy: 'project:secret/7',
					sections: [{ name: 'Section', rule: 'author:@me' }]
				}[field]
			});
			expect(scope(after)).not.toBe(scope(before));
		}
	);

	it.each(['hideBots', 'hideOthersDrafts', 'excludedTeams', 'staleDays'] as const)(
		'retains source/filter dependency %s',
		(field) => {
			const before = structuredClone(DEFAULT_SETTINGS);
			const after = structuredClone(before);
			Object.assign(after.dash, {
				[field]: {
					hideBots: false,
					hideOthersDrafts: false,
					excludedTeams: ['org/team'],
					staleDays: 30
				}[field]
			});
			expect(scope(after)).not.toBe(scope(before));
		}
	);

	it.each(['category:effort', 'custom', 'source'])(
		'retains all category semantics for %s dependencies',
		(dependency) => {
			const before = structuredClone(DEFAULT_SETTINGS);
			if (dependency === 'source') before.views[0].searches = ['is:open category:Effort/Low'];
			else if (dependency === 'custom')
				Object.assign(before.views[0], {
					groupBy: 'custom',
					sections: [{ name: 'Low', rule: 'category:Effort/Low' }]
				});
			else before.views[0].groupBy = 'category:effort';
			for (const [field, value] of Object.entries({
				name: 'Changed',
				description: 'Changed choice',
				rule: 'about:"security change"'
			})) {
				const after = structuredClone(before);
				Object.assign(after.categoryGroups[0].categories[0], { [field]: value });
				expect(scope(after), field).not.toBe(scope(before));
			}
			const renamed = structuredClone(before);
			renamed.categoryGroups[0].name = 'Renamed group';
			expect(scope(renamed)).not.toBe(scope(before));
		}
	);

	it('requires smart conditions to enter source membership and custom grouping through categories', () => {
		expect(queryError('is:open about:"security change"', 'search')).toContain('cannot use about:');
		expect(queryError('about:"security change"', 'section')).toContain('cannot use about:');
		expect(queryError('about:"security change"', 'rule')).toBeNull();
	});

	it('ignores categories when no source, grouping, or custom rule consumes them', () => {
		const before = structuredClone(DEFAULT_SETTINGS);
		const after = structuredClone(before);
		after.categoryGroups = [];
		expect(scope(after)).toBe(scope(before));
	});

	it('fails closed for unknown fields at the settings, source, view, sort, and rule levels', () => {
		const before = structuredClone(DEFAULT_SETTINGS);
		for (const target of ['settings', 'dash', 'view', 'sort', 'section']) {
			const after = structuredClone(before);
			if (target === 'settings') Object.assign(after, { futureScope: true });
			if (target === 'dash') Object.assign(after.dash, { futureScope: true });
			if (target === 'view') Object.assign(after.views[0], { futureScope: true });
			if (target === 'sort') Object.assign(after.views[0], { sort: { futureScope: true } });
			if (target === 'section')
				Object.assign(after.views[0], {
					sections: [{ name: 'Section', rule: '', futureScope: true }]
				});
			expect(scope(after), target).not.toBe(scope(before));
		}
	});
});
