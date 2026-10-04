import { compileQuery } from './query';
import type { SubjectFacts } from './subject';
import type { LastComment, Rule, SavedView } from './types';

export const YES_AT = 0.8;
export const NO_AT = 0.2;
export const URGENT_SCORE = 1.5;
export const BODY_EXCERPT_CHARS = 500;
export const MAX_SMART_CONDITIONS = 10;
export const CHARS_PER_TOKEN = 4;

export const URGENCY_LEVELS = [
	'Routine: no time pressure',
	'Soon: someone waits on it, or it should be done this week',
	'Blocking: it blocks a release, other work, or users, or it is about an incident or an outage'
];

const REPLY = 'reply';
const URGENCY = 'urgency';
const ABOUT_PREFIX = 'about_';

export interface StoredDecisions {
	contentHash: string;
	reply?: number;
	urgency?: number;
	about?: Record<string, number>;
}

export interface SubjectDecisions {
	commentsNeedMe: boolean | null;
	urgent: boolean;
	smart: string[];
}

export const NO_DECISIONS: SubjectDecisions = { commentsNeedMe: null, urgent: false, smart: [] };

export type DecisionQuestion =
	| { type: 'noul'; instructions: string; criteria?: { true: string; false: string } }
	| { type: 'score'; instructions: string; criteria: string[] };

export interface DecisionState {
	title: string;
	repo: string;
	kind: 'pull request' | 'issue';
	author: string;
	labels: string[];
	body: string;
	comments: { author: string; bot: boolean; body: string }[];
	newCommentsForYou: { author: string; body: string }[];
	you: { login: string; roles: string[] };
}

export interface DecisionRequest {
	state: DecisionState;
	questions: Record<string, DecisionQuestion>;
}

export interface SmartCondition {
	id: string;
	text: string;
}

export type DecisionAnswers = Record<
	string,
	{ type: 'noul'; noul: number } | { type: 'score'; score: number } | { type: string }
>;

export function cyrb53(text: string): string {
	let h1 = 0xdeadbeef;
	let h2 = 0x41c6ce57;
	for (let i = 0; i < text.length; i++) {
		const ch = text.charCodeAt(i);
		h1 = Math.imul(h1 ^ ch, 2654435761);
		h2 = Math.imul(h2 ^ ch, 1597334677);
	}
	h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
	h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
	return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

const normalizeCondition = (text: string) => text.trim().replace(/\s+/g, ' ').toLowerCase();

export const conditionId = (text: string) => cyrb53(normalizeCondition(text));

export function smartConditions(rules: Rule[], views: SavedView[]): SmartCondition[] {
	const byId = new Map<string, SmartCondition>();
	const queries = [
		...rules.filter((r) => r.enabled !== false).map((r) => r.when ?? ''),
		...views.map((v) => v.query ?? '')
	];
	for (const query of queries)
		for (const text of compileQuery(query).about ?? [])
			byId.set(conditionId(text), { id: conditionId(text), text });
	return [...byId.values()];
}

export function bodyExcerpt(bodyText: string | null | undefined): string {
	return String(bodyText ?? '').slice(0, BODY_EXCERPT_CHARS);
}

const recentComments = (s: SubjectFacts): LastComment[] =>
	[s.previousComment, s.lastComment].filter((c): c is LastComment => !!c);

const isMe = (login: string, me: string) => login.toLowerCase() === me.toLowerCase();

export function newCommentsForYou(s: SubjectFacts, me: string): LastComment[] {
	const recent = recentComments(s);
	const afterMine = recent.map((c) => isMe(c.author, me)).lastIndexOf(true) + 1;
	return recent.slice(afterMine).filter((c) => !c.authorIsBot);
}

function newestCommentIsFromAnotherPerson(s: SubjectFacts, me: string): boolean {
	const c = s.lastComment;
	return !!c && !c.authorIsBot && !isMe(c.author, me);
}

export function contentHash(s: SubjectFacts): string {
	return cyrb53(
		JSON.stringify([
			s.title,
			s.labels.map((l) => l.name),
			s.body ?? '',
			recentComments(s).map((c) => [c.author, c.authorIsBot, c.body])
		])
	);
}

function rolesOf(s: SubjectFacts, me: string): string[] {
	const roles: string[] = [];
	if (isMe(s.author, me)) roles.push('author');
	if (s.assignees.some((a) => isMe(a, me))) roles.push('assignee');
	if (s.reviewRequests.some((r) => !r.team && isMe(r.name, me))) roles.push('requested reviewer');
	return roles;
}

export function decisionState(s: SubjectFacts, me: string): DecisionState {
	return {
		title: s.title,
		repo: s.repo,
		kind: s.kind === 'pr' ? 'pull request' : 'issue',
		author: s.author,
		labels: s.labels.map((l) => l.name),
		body: s.body ?? '',
		comments: recentComments(s).map((c) => ({
			author: c.author,
			bot: c.authorIsBot,
			body: c.body
		})),
		newCommentsForYou: newCommentsForYou(s, me).map((c) => ({ author: c.author, body: c.body })),
		you: { login: me, roles: rolesOf(s, me) }
	};
}

function replyQuestion(me: string): DecisionQuestion {
	return {
		type: 'noul',
		instructions: `Do the comments in \`newCommentsForYou\` ask @${me} a question, ask @${me} to do something, or wait for an answer from @${me}?`,
		criteria: {
			true: `They ask @${me} a question, or ask for a change, a review, a decision, or an answer`,
			false: `Thanks, approval, a status update, +1, or talk that needs nothing from @${me}`
		}
	};
}

const URGENCY_QUESTION: DecisionQuestion = {
	type: 'score',
	instructions:
		'How urgent is this, from its title, labels, body, and comments? Judge only what the text says.',
	criteria: URGENCY_LEVELS
};

function aboutQuestion(text: string): DecisionQuestion {
	return {
		type: 'noul',
		instructions: `Is this pull request or issue about the following? ${text}`
	};
}

export interface DecisionPlan {
	request: DecisionRequest;
	contentHash: string;
	aboutIds: Record<string, string>;
}

export function planDecisions(
	s: SubjectFacts,
	me: string,
	stored: StoredDecisions | null | undefined,
	conditions: SmartCondition[]
): DecisionPlan | null {
	const hash = contentHash(s);
	const known = stored?.contentHash === hash ? stored : null;
	const questions: Record<string, DecisionQuestion> = {};
	if (known?.reply === undefined && newestCommentIsFromAnotherPerson(s, me))
		questions[REPLY] = replyQuestion(me);
	if (known?.urgency === undefined) questions[URGENCY] = URGENCY_QUESTION;
	const aboutIds: Record<string, string> = {};
	for (const c of conditions) {
		if (known?.about?.[c.id] !== undefined) continue;
		const key = `${ABOUT_PREFIX}${c.id}`;
		questions[key] = aboutQuestion(c.text);
		aboutIds[key] = c.id;
	}
	if (!Object.keys(questions).length) return null;
	return { request: { state: decisionState(s, me), questions }, contentHash: hash, aboutIds };
}

export function estimateTokens(request: DecisionRequest): number {
	return Math.ceil(JSON.stringify(request).length / CHARS_PER_TOKEN);
}

const noulOf = (a: DecisionAnswers[string] | undefined) =>
	a && 'noul' in a && typeof a.noul === 'number' ? a.noul : undefined;
const scoreOf = (a: DecisionAnswers[string] | undefined) =>
	a && 'score' in a && typeof a.score === 'number' ? a.score : undefined;

export function mergeDecisions(
	stored: StoredDecisions | null | undefined,
	plan: DecisionPlan,
	answers: DecisionAnswers
): StoredDecisions {
	const base: StoredDecisions =
		stored?.contentHash === plan.contentHash ? { ...stored } : { contentHash: plan.contentHash };
	const reply = noulOf(answers[REPLY]);
	if (reply !== undefined) base.reply = reply;
	const urgency = scoreOf(answers[URGENCY]);
	if (urgency !== undefined) base.urgency = urgency;
	for (const [key, id] of Object.entries(plan.aboutIds)) {
		const p = noulOf(answers[key]);
		if (p !== undefined) base.about = { ...base.about, [id]: p };
	}
	return base;
}

export function yesOrNo(probability: number | undefined): boolean | null {
	if (probability === undefined) return null;
	if (probability >= YES_AT) return true;
	if (probability <= NO_AT) return false;
	return null;
}

export function readDecisions(
	stored: StoredDecisions | null | undefined,
	s: SubjectFacts
): SubjectDecisions {
	if (!stored || stored.contentHash !== contentHash(s)) return NO_DECISIONS;
	return {
		commentsNeedMe: yesOrNo(stored.reply),
		urgent: (stored.urgency ?? 0) >= URGENT_SCORE,
		smart: Object.entries(stored.about ?? {})
			.filter(([, p]) => yesOrNo(p) === true)
			.map(([id]) => id)
	};
}

export function parseStoredDecisions(json: string | null | undefined): StoredDecisions | null {
	if (!json) return null;
	try {
		return JSON.parse(json) as StoredDecisions;
	} catch {
		return null;
	}
}
