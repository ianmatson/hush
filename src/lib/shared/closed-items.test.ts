import { describe, expect, it } from 'vitest';
import {
	KEEP_CLOSED_MS,
	closedLabel,
	closedSectionLabel,
	closedTimeOf,
	keepsClosed,
	keptAfterChange,
	newestCloseFirst,
	searchFindsOnlyOpen,
	stillKept
} from './closed-items';

const CLOSED_AT = '2026-10-13T10:00:00Z';
const UPDATED_AT = '2026-10-13T12:00:00Z';
const closedAtMs = Date.parse(CLOSED_AT);

describe('closed items', () => {
	it('keeps closed items in a view unless the view turns it off', () => {
		expect(keepsClosed({})).toBe(true);
		expect(keepsClosed({ keepClosed: true })).toBe(true);
		expect(keepsClosed({ keepClosed: false })).toBe(false);
	});

	it('keeps an item for a day after it closed', () => {
		const item = { closedAt: CLOSED_AT, updatedAt: UPDATED_AT };
		expect(stillKept(item, closedAtMs + KEEP_CLOSED_MS - 1)).toBe(true);
		expect(stillKept(item, closedAtMs + KEEP_CLOSED_MS)).toBe(false);
	});

	it('counts from the update time when the close time is not known', () => {
		expect(closedTimeOf({ closedAt: CLOSED_AT, updatedAt: UPDATED_AT })).toBe(CLOSED_AT);
		expect(closedTimeOf({ closedAt: null, updatedAt: UPDATED_AT })).toBe(UPDATED_AT);
		expect(stillKept({ updatedAt: UPDATED_AT }, closedAtMs + KEEP_CLOSED_MS)).toBe(true);
	});

	it('keeps an item that closes while it is open in the list, or that it already keeps', () => {
		expect(keptAfterChange({ state: 'open' }, { state: 'merged' })).toBe(true);
		expect(keptAfterChange({ state: 'merged', keptAfterClose: true }, { state: 'merged' })).toBe(
			true
		);
	});

	it('does not keep an item that is open, or that a search found already closed', () => {
		expect(keptAfterChange({ state: 'open' }, { state: 'open' })).toBe(false);
		expect(keptAfterChange({ state: 'closed', keptAfterClose: true }, { state: 'open' })).toBe(
			false
		);
		expect(keptAfterChange({ state: 'merged' }, { state: 'merged' })).toBe(false);
	});

	it('knows the searches that find only open items', () => {
		expect(searchFindsOnlyOpen('is:pr is:open review-requested:@me')).toBe(true);
		expect(searchFindsOnlyOpen('is:open involves:@me')).toBe(true);
		expect(searchFindsOnlyOpen('repo:PostHog/posthog.com state:open')).toBe(true);
		expect(searchFindsOnlyOpen('IS:OPEN author:@me')).toBe(true);
	});

	it('knows the searches that also find merged and closed items', () => {
		expect(searchFindsOnlyOpen('involves:@me')).toBe(false);
		expect(searchFindsOnlyOpen('is:pr is:merged author:@me')).toBe(false);
		expect(searchFindsOnlyOpen('is:issue is:closed assignee:@me')).toBe(false);
		expect(searchFindsOnlyOpen('is:pr is:unmerged author:@me')).toBe(false);
		expect(searchFindsOnlyOpen('-is:open author:@me')).toBe(false);
		expect(searchFindsOnlyOpen('label:is:open')).toBe(false);
	});

	it('puts the newest close first', () => {
		const older = { closedAt: '2026-10-13T08:00:00Z', updatedAt: UPDATED_AT };
		const newer = { closedAt: CLOSED_AT, updatedAt: UPDATED_AT };
		expect([older, newer].sort(newestCloseFirst)).toEqual([newer, older]);
	});

	it('names the section and the close reason', () => {
		expect(closedSectionLabel(['pr'])).toBe('Merged and closed');
		expect(closedSectionLabel(['pr', 'issue'])).toBe('Merged and closed');
		expect(closedSectionLabel(['issue'])).toBe('Closed');
		expect(closedLabel(null)).toBe('Closed');
		expect(closedLabel('completed')).toBe('Closed');
		expect(closedLabel('not_planned')).toBe('Closed as not planned');
	});
});
