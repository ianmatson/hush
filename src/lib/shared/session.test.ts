import { describe, expect, it } from 'vitest';
import { deviceLabel } from './session';

describe('deviceLabel', () => {
	it('names the browser and the system', () => {
		expect(
			deviceLabel(
				'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
			)
		).toBe('Chrome on macOS');
		expect(
			deviceLabel(
				'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
			)
		).toBe('Safari on iOS');
		expect(deviceLabel('')).toBe('Browser');
	});
});
