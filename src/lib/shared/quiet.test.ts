import { describe, expect, it } from 'vitest';
import { fromClock, inQuietHours, toClock, validateQuietHours } from './quiet';

// 2026-09-26 is a Saturday; 2026-09-28 is a Monday.
const at = (iso: string) => Date.parse(iso);
const night = { from: 22 * 60, to: 7 * 60, weekends: false, timeZone: 'UTC' };

describe('quiet hours', () => {
	it('is off when not set', () => {
		expect(inQuietHours(null, at('2026-09-28T23:00:00Z'))).toBe(false);
	});

	it('crosses midnight', () => {
		expect(inQuietHours(night, at('2026-09-28T21:59:00Z'))).toBe(false);
		expect(inQuietHours(night, at('2026-09-28T22:00:00Z'))).toBe(true);
		expect(inQuietHours(night, at('2026-09-29T03:00:00Z'))).toBe(true);
		expect(inQuietHours(night, at('2026-09-29T07:00:00Z'))).toBe(false);
	});

	it('works for a range in one day', () => {
		const lunch = { ...night, from: 12 * 60, to: 13 * 60 };
		expect(inQuietHours(lunch, at('2026-09-28T12:30:00Z'))).toBe(true);
		expect(inQuietHours(lunch, at('2026-09-28T13:00:00Z'))).toBe(false);
	});

	it('uses the time zone', () => {
		const ny = { ...night, timeZone: 'America/New_York' };
		// 23:00 in New York is 03:00 UTC the next day (EDT, UTC-4).
		expect(inQuietHours(ny, at('2026-09-29T03:00:00Z'))).toBe(true);
		expect(inQuietHours(ny, at('2026-09-28T23:00:00Z'))).toBe(false);
	});

	it('can be quiet all weekend', () => {
		expect(inQuietHours(night, at('2026-09-26T12:00:00Z'))).toBe(false);
		expect(inQuietHours({ ...night, weekends: true }, at('2026-09-26T12:00:00Z'))).toBe(true);
		expect(inQuietHours({ ...night, weekends: true }, at('2026-09-28T12:00:00Z'))).toBe(false);
	});

	it('validates', () => {
		expect(validateQuietHours(null)).toBeNull();
		expect(validateQuietHours(night)).toBeNull();
		expect(validateQuietHours({ ...night, to: night.from })).toMatch(/different/);
		expect(validateQuietHours({ ...night, from: 1440 })).toBeTruthy();
		expect(validateQuietHours({ ...night, timeZone: 'Mars/Base' })).toMatch(/time zone/);
		expect(validateQuietHours({ ...night, weekends: 'yes' })).toBeTruthy();
	});

	it('converts clock values', () => {
		expect(toClock(22 * 60 + 5)).toBe('22:05');
		expect(fromClock('07:30')).toBe(450);
		expect(fromClock('')).toBeNull();
	});
});
