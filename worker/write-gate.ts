import { gateAllowsRepo, writeGate, writesBlockedMessage } from '../src/lib/shared/write-gate';
import type { Env } from './db';
import { nodeSubject, type WrittenSubject } from './subject-writes';

const NO_ALLOWED_REPOS = undefined;

const gateOf = (env: Env) => writeGate(env.GITHUB_WRITES, env.GITHUB_WRITES_ALLOW);

export function writeBlockForRepo(env: Env, repo: string | null): string | null {
	const gate = gateOf(env);
	return gateAllowsRepo(gate, repo) ? null : writesBlockedMessage(gate);
}

export function writeBlockForEveryRepo(env: Env): string | null {
	const gate = gateOf(env);
	return gate.kind === 'none' ? writesBlockedMessage(gate) : null;
}

export function writeBlockForProjects(env: Env): string | null {
	const gate = writeGate(env.GITHUB_WRITES, NO_ALLOWED_REPOS);
	return gate.kind === 'all' ? null : writesBlockedMessage(gate);
}

interface NodeWriteCheck {
	blocked: string | null;
	subject: WrittenSubject | null;
}

export async function checkNodeWrite(
	env: Env,
	token: string,
	nodeId: string,
	{ subjectNeeded }: { subjectNeeded: boolean }
): Promise<NodeWriteCheck> {
	const blockedEverywhere = writeBlockForEveryRepo(env);
	if (blockedEverywhere) return { blocked: blockedEverywhere, subject: null };
	const repoNeeded = gateOf(env).kind === 'repos';
	const subject = subjectNeeded || repoNeeded ? await nodeSubject(token, nodeId) : null;
	return { blocked: writeBlockForRepo(env, subject?.repo ?? null), subject };
}

export async function writeBlockForNode(
	env: Env,
	token: string,
	nodeId: string
): Promise<string | null> {
	return (await checkNodeWrite(env, token, nodeId, { subjectNeeded: false })).blocked;
}
