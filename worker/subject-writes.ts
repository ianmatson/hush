import type { Ctx } from './app';
import { poller } from './app';
import { graphql, hasGraphqlErrorAt } from './github';

const NODE_SUBJECT_QUERY = `query($id: ID!) { node(id: $id) {
  ... on PullRequest { number repository { nameWithOwner } }
  ... on Issue { number repository { nameWithOwner } }
  ... on PullRequestReview { pullRequest { number repository { nameWithOwner } } }
  ... on PullRequestReviewThread { pullRequest { number repository { nameWithOwner } } }
  ... on PullRequestReviewComment { pullRequest { number repository { nameWithOwner } } }
  ... on IssueComment { issue { number repository { nameWithOwner } } }
} }`;

export interface WrittenSubject {
	repo: string;
	number: number;
}

type SubjectRef = { number?: number; repository?: { nameWithOwner?: string } };
type NodeSubjectData = {
	node?: (SubjectRef & { pullRequest?: SubjectRef; issue?: SubjectRef }) | null;
};

export async function nodeSubject(token: string, id: string): Promise<WrittenSubject | null> {
	const result = await graphql<NodeSubjectData>(token, NODE_SUBJECT_QUERY, { id }).catch(
		() => null
	);
	if (!result?.ok || hasGraphqlErrorAt(result.errors, ['node'])) return null;
	const node = result.data?.node;
	const subject = node?.pullRequest ?? node?.issue ?? node;
	return subject?.number && subject.repository?.nameWithOwner
		? { repo: subject.repository.nameWithOwner, number: subject.number }
		: null;
}

export async function refreshWrittenSubject(c: Ctx, subject: WrittenSubject): Promise<void> {
	const result = await poller(c.env, c.get('user').id)
		.recheck(subject.repo, subject.number)
		.catch((error) => ({ error: (error as Error).message }));
	if ('error' in result) console.error('subject refresh after write failed', result.error);
}
