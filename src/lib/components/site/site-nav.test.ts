import { describe, expect, it } from 'vitest';
import { isCurrentSection } from './site-nav';

describe('isCurrentSection', () => {
	it('matches the section page and its subpages', () => {
		expect(isCurrentSection('/docs', '/docs')).toBe(true);
		expect(isCurrentSection('/docs/', '/docs')).toBe(true);
		expect(isCurrentSection('/docs/rules', '/docs')).toBe(true);
	});

	it('does not match other pages that share a prefix', () => {
		expect(isCurrentSection('/docsearch', '/docs')).toBe(false);
		expect(isCurrentSection('/', '/docs')).toBe(false);
		expect(isCurrentSection('/pricing', '/docs')).toBe(false);
	});
});
