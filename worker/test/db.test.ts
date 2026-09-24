import { describe, expect, it } from 'vitest';
import { viewWhere } from '../db';

describe('viewWhere', () => {
	// The API always binds (userId, now). D1 fails with a 500 if a statement has fewer parameters.
	it.each(['action', 'fyi', 'snoozed', 'done', 'muted', 'all'])(
		'"%s" uses both ?1 and ?2',
		(view) => {
			const sql = viewWhere(view);
			expect(sql).toContain('?1');
			expect(sql).toContain('?2');
		}
	);
});
