import {
	contentHash,
	cyrb53,
	identityHash,
	NO_DECISIONS,
	rolesOf,
	URGENT_SCORE,
	yesOrNo,
	type SubjectDecisions
} from '../shared/decisions';
import type { SubjectFacts } from '../shared/subject';
import type { Knowledge } from './eligibility';
import type { Analysis } from './types';

export const replyInputOf = (facts: SubjectFacts, me: string) =>
	cyrb53(JSON.stringify([contentHash(facts), rolesOf(facts, me)]));

export const identityInputOf = (facts: SubjectFacts) => identityHash(facts);

export interface AnalysisView {
	decisions: SubjectDecisions;
	strict: Knowledge;
	lenient: Knowledge;
	stale: boolean;
}

const NOTHING_KNOWN = (smartOn: boolean): Knowledge => ({
	smartOn,
	about: new Map(),
	choices: new Map()
});

function knowledgeOf(analysis: Analysis): Knowledge {
	return {
		smartOn: true,
		about: new Map(Object.entries(analysis.about).map(([id, p]) => [id, yesOrNo(p) === true])),
		choices: new Map(Object.entries(analysis.choices))
	};
}

export function analysisView(
	analysis: Analysis | null,
	facts: SubjectFacts,
	me: string,
	smartOn: boolean,
	version: string
): AnalysisView {
	if (!smartOn || !analysis || analysis.version !== version) {
		const none = NOTHING_KNOWN(smartOn);
		return { decisions: NO_DECISIONS, strict: none, lenient: none, stale: false };
	}
	const replyFresh = analysis.replyInput === replyInputOf(facts, me);
	const stale = analysis.identityInput !== identityInputOf(facts);
	const lenient = knowledgeOf(analysis);
	return {
		decisions: {
			commentsNeedMe: replyFresh ? yesOrNo(analysis.reply) : null,
			urgent: replyFresh && (analysis.urgency ?? 0) >= URGENT_SCORE,
			smart: [...lenient.about].filter(([, yes]) => yes).map(([id]) => id),
			choices: Object.fromEntries(lenient.choices)
		},
		strict: stale ? NOTHING_KNOWN(true) : lenient,
		lenient,
		stale
	};
}
