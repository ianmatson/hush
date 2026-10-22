import { readFileSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

interface Statement {
	sql: string;
	args: SQLInputValue[];
}

export function sqliteD1(migrations: string[]) {
	const db = new DatabaseSync(':memory:', { enableForeignKeyConstraints: false });
	for (const file of migrations) db.exec(readFileSync(file, 'utf8'));
	const batches: Statement[][] = [];
	const statement = (sql: string, args: SQLInputValue[] = []) => ({
		sql,
		args,
		bind: (...values: SQLInputValue[]) => statement(sql, values),
		all: async () => ({ results: db.prepare(sql).all(...args) }),
		first: async () => db.prepare(sql).get(...args) ?? null,
		run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...args).changes) } })
	});
	const d1 = {
		prepare: (sql: string) => statement(sql),
		batch: async (statements: Statement[]) => {
			batches.push(statements);
			db.exec('BEGIN');
			try {
				const results = statements.map(({ sql, args }) => db.prepare(sql).run(...args));
				db.exec('COMMIT');
				return results;
			} catch (error) {
				db.exec('ROLLBACK');
				throw error;
			}
		}
	};
	return { db, d1: d1 as unknown as D1Database, batches };
}

export const WEBHOOK_MIGRATION = 'migrations/0019_webhook_routes.sql';
