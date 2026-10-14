import type { Ctx } from './app';
import { poller } from './app';
import { gh, hasGraphqlErrorAt, type GraphqlError } from './github';

const SUBJECT_REF_QUERY = `query($id: ID!) { node(id: $id) {
  ... on PullRequest { number repository { nameWithOwner } }
  ... on PullRequestReview { pullRequest { number repository { nameWithOwner } } }
  ... on PullRequestReviewThread { pullRequest { number repository { nameWithOwner } } }
  ... on PullRequestReviewComment { pullRequest { number repository { nameWithOwner } } }
} }`;

export interface WrittenSubject {
	repo: string;
	number: number;
}

export async function subjectBeforeWrite(
	token: string,
	id: string
): Promise<WrittenSubject | null> {
	const response = await gh(token, '/graphql', {
		method: 'POST',
		body: JSON.stringify({ query: SUBJECT_REF_QUERY, variables: { id } })
	}).catch(() => null);
	if (!response?.ok) return null;
	const result = (await response.json().catch(() => null)) as {
		data?: {
			node?: {
				number?: number;
				repository?: { nameWithOwner: string };
				pullRequest?: { number: number; repository: { nameWithOwner: string } };
			};
		};
		errors?: GraphqlError[];
	} | null;
	if (!result) return null;
	if (hasGraphqlErrorAt(result.errors ?? [], ['node'])) return null;
	const node = result.data?.node;
	const subject = node?.pullRequest ?? node;
	return subject?.number && subject.repository?.nameWithOwner
		? { repo: subject.repository.nameWithOwner, number: subject.number }
		: null;
}

export async function refreshWrittenSubject(c: Ctx, subject: WrittenSubject): Promise<void> {
	await poller(c.env, c.get('user').id)
		.recheck(subject.repo, subject.number)
		.catch((error) =>
			console.error('subject refresh after write failed', (error as Error).message)
		);
}
