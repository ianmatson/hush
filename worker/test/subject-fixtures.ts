import type { SubjectFacts } from '../../src/lib/shared/subject';

export function subjectFixture(overrides: Partial<SubjectFacts> = {}): SubjectFacts {
	const at = new Date().toISOString();
	return {
		id: 'PR_1',
		kind: 'pr',
		repo: 'sandbox/web',
		number: 1,
		title: 'Fix',
		url: 'https://github.com/sandbox/web/pull/1',
		author: 'alex',
		authorAvatar: null,
		authorIsBot: false,
		createdAt: at,
		updatedAt: at,
		state: 'open',
		draft: false,
		labels: [],
		assignees: [],
		comments: 0,
		lastComment: null,
		ci: 'SUCCESS',
		reviewDecision: null,
		mergeable: 'MERGEABLE',
		additions: 2,
		deletions: 1,
		lastCommitAt: at,
		reviewRequests: [],
		requestEvents: [],
		myReview: null,
		latestReview: null,
		verdicts: [],
		openThreads: 0,
		...overrides
	};
}
