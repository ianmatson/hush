import { describe, expect, it } from 'vitest';
import { logTail, parseRunTitle } from '../peek-other';

describe('workflow run notifications', () => {
	it('read the workflow and the branch from the title', () => {
		expect(parseRunTitle('Deploy preview workflow run failed for fix/login branch')).toEqual({
			workflow: 'Deploy preview',
			result: 'failed',
			branch: 'fix/login'
		});
		expect(parseRunTitle('check workflow run, Attempt #2 failed for failing-ci branch')).toEqual({
			workflow: 'check',
			result: 'failed',
			branch: 'failing-ci'
		});
		expect(parseRunTitle('CI workflow run cancelled for main branch')?.workflow).toBe('CI');
		expect(parseRunTitle('Something else')).toBeNull();
	});

	it('keep the end of a log up to its last error, without timestamps', () => {
		const log = [
			'2026-09-28T10:00:00.0000000Z cut line',
			'2026-09-28T10:00:01.0000000Z ##[group]Run npm test',
			'2026-09-28T10:00:02.0000000Z \x1b[36;1m> test\x1b[0m',
			'2026-09-28T10:00:03.0000000Z ##[error]Process completed with exit code 1.',
			'2026-09-28T10:00:04.0000000Z Post job cleanup.',
			'2026-09-28T10:00:05.0000000Z a',
			'2026-09-28T10:00:06.0000000Z b',
			'2026-09-28T10:00:07.0000000Z c'
		].join('\n');
		expect(logTail(log)).toEqual([
			'Run npm test',
			'> test',
			'##[error]Process completed with exit code 1.',
			'Post job cleanup.',
			'a'
		]);
	});
});
