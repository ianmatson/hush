export type WriteGate =
	{ kind: 'all' } | { kind: 'none' } | { kind: 'repos'; repos: ReadonlySet<string> };

const WRITES_OFF = 'off';

export function writeGate(writes: string | undefined, allow: string | undefined): WriteGate {
	if (writes !== WRITES_OFF) return { kind: 'all' };
	const repos = new Set(
		(allow ?? '')
			.split(',')
			.map((repo) => repo.trim().toLowerCase())
			.filter((repo) => /^[^/\s]+\/[^/\s]+$/.test(repo))
	);
	return repos.size ? { kind: 'repos', repos } : { kind: 'none' };
}

export function gateAllowsRepo(gate: WriteGate, repo: string | null): boolean {
	if (gate.kind === 'all') return true;
	if (gate.kind === 'none' || !repo) return false;
	return gate.repos.has(repo.toLowerCase());
}

export const writesBlockedMessage = (gate: WriteGate) =>
	gate.kind === 'repos'
		? `GitHub writes are off in this copy, except in ${[...gate.repos].join(', ')} (GITHUB_WRITES_ALLOW).`
		: 'GitHub writes are off in this copy (GITHUB_WRITES=off).';
