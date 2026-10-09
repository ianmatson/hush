import { describe, expect, it } from 'vitest';
import { DEFAULT_ROWS, rowShows, validateRows } from './row-parts';
import {
	allEmojiOptions,
	allLucideOptions,
	EMOJI,
	LUCIDE_ICONS,
	parseMarkIcon,
	searchIcons
} from './mark-icons';
import { DEFAULT_CATEGORY_GROUPS, validateCategoryGroups } from './categories';
import { parseSettings } from './settings';

describe('row contents', () => {
	it('keep the parts that say what to do next by default', () => {
		for (const part of ['sources', 'labels', 'threads'])
			expect(rowShows(DEFAULT_ROWS, 'pr', part)).toBe(false);
		for (const part of ['size', 'comments', 'ci', 'review', 'conflicts', 'categories'])
			expect(rowShows(DEFAULT_ROWS, 'pr', part)).toBe(true);
		expect(rowShows(DEFAULT_ROWS, 'thread', 'why')).toBe(false);
		expect(rowShows(DEFAULT_ROWS, 'thread', 'categories')).toBe(true);
	});

	it('accept only known parts for each kind of row', () => {
		expect(validateRows({ pr: ['labels', 'size'], thread: ['why'] })).toBeNull();
		expect(validateRows({ issue: ['ci'] })).toMatch(/unknown part "ci"/);
		expect(validateRows({ inbox: [] })).toMatch(/Unknown setting "rows.inbox"/);
		expect(validateRows({ pr: 'labels' })).toMatch(/list/);
	});

	it('keep the defaults for kinds a user did not change', () => {
		const s = parseSettings(JSON.stringify({ rows: { pr: ['labels'] } }));
		expect(s.rows).toEqual({ ...DEFAULT_ROWS, pr: ['labels'] });
	});
});

describe('category icons', () => {
	it('are a known Lucide icon or one emoji', () => {
		expect(parseMarkIcon('lucide:bug')).toEqual({ kind: 'lucide', id: 'bug' });
		expect(parseMarkIcon('🐛')).toEqual({ kind: 'emoji', text: '🐛' });
		expect(parseMarkIcon('lucide:signal-high')).toEqual({ kind: 'lucide', id: 'signal-high' });
		expect(parseMarkIcon('lucide:Not An Icon')).toBeNull();
		expect(parseMarkIcon('bug')).toBeNull();
		expect(parseMarkIcon(undefined)).toBeNull();
	});

	it('are checked with the categories', () => {
		const withIcon = (icon: string) =>
			DEFAULT_CATEGORY_GROUPS.map((g) => ({
				...g,
				categories: g.categories.map((c, i) => (i === 0 ? { ...c, icon } : c))
			}));
		expect(validateCategoryGroups(withIcon('🪲'))).toBeNull();
		expect(validateCategoryGroups(withIcon('lucide:No pe'))).toMatch(/"icon"/);
	});

	it('are found by name or keyword', () => {
		expect(searchIcons(LUCIDE_ICONS, 'defect').map((o) => o.id)).toContain('bug');
		expect(searchIcons(EMOJI, 'hedgehog').map((o) => o.id)).toEqual(['🦔']);
		expect(searchIcons(LUCIDE_ICONS, '')).toHaveLength(LUCIDE_ICONS.length);
	});

	it('offer every icon and emoji, the common ones first', () => {
		const icons = allLucideOptions(['a-arrow-down', 'bug', 'zap']);
		expect(icons.slice(0, LUCIDE_ICONS.length).map((o) => o.id)).toEqual(
			LUCIDE_ICONS.map((o) => o.id)
		);
		expect(icons.filter((o) => o.id === 'bug')).toHaveLength(1);
		expect(searchIcons(icons, 'arrow down').map((o) => o.id)).toEqual(['a-arrow-down']);
		const emoji = allEmojiOptions([
			{ emoji: '🦔', names: ['hedgehog'], tags: [] },
			{ emoji: '🦩', names: ['flamingo'], tags: ['pink_bird'] }
		]);
		expect(emoji).toHaveLength(EMOJI.length + 1);
		expect(searchIcons(emoji, 'flamingo').map((o) => o.id)).toEqual(['🦩']);
		expect(searchIcons(emoji, 'posthog').map((o) => o.id)).toEqual(['🦔']);
	});

	it('every Lucide icon has a component', async () => {
		const { LUCIDE_COMPONENTS } = await import('../mark-icon-components');
		expect(Object.keys(LUCIDE_COMPONENTS).sort()).toEqual(LUCIDE_ICONS.map((i) => i.id).sort());
	});
});
