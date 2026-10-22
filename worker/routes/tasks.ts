import { isNodeId } from '../../src/lib/shared/item-page';
import { toggleTask, type TaskToggle } from '../../src/lib/shared/task-list';
import { userToken } from '../db';
import { failedWriteStatus, graphql } from '../github';
import { routes, json } from '../app';
import { refreshWrittenSubject } from '../subject-writes';
import { writeBlockForEveryRepo, writeBlockForRepo } from '../write-gate';

const PARENT = 'number repository { nameWithOwner }';

const TASK_BODY_QUERY = `query($id: ID!) { node(id: $id) {
  __typename
  ... on PullRequest { body viewerCanUpdate ${PARENT} }
  ... on Issue { body viewerCanUpdate ${PARENT} }
  ... on IssueComment { body viewerCanUpdate issue { ${PARENT} } }
  ... on PullRequestReview { body viewerCanUpdate pullRequest { ${PARENT} } }
} }`;

type Parent = { number: number; repository: { nameWithOwner: string } };

type TaskBody = Partial<Parent> & {
	__typename: string;
	body: string;
	viewerCanUpdate: boolean;
	issue?: Parent;
	pullRequest?: Parent;
};

const UPDATES: Record<string, { mutation: string; idField: string; resultField: string }> = {
	PullRequest: {
		mutation: 'updatePullRequest',
		idField: 'pullRequestId',
		resultField: 'pullRequest'
	},
	Issue: { mutation: 'updateIssue', idField: 'id', resultField: 'issue' },
	IssueComment: { mutation: 'updateIssueComment', idField: 'id', resultField: 'issueComment' },
	PullRequestReview: {
		mutation: 'updatePullRequestReview',
		idField: 'pullRequestReviewId',
		resultField: 'pullRequestReview'
	}
};

const isTaskToggle = <T extends Partial<TaskToggle>>(b: T): b is T & TaskToggle =>
	Number.isSafeInteger(b.index) &&
	Number.isSafeInteger(b.count) &&
	b.index! >= 0 &&
	b.index! < b.count! &&
	typeof b.checked === 'boolean';

const parentOf = (node: TaskBody): Parent | null =>
	node.issue ??
	node.pullRequest ??
	(node.number && node.repository ? { number: node.number, repository: node.repository } : null);

const app = routes().post('/api/tasks/toggle', json<{ id: string } & TaskToggle>(), async (c) => {
	const b = c.req.valid('json');
	if (!isNodeId(b.id)) return c.json({ error: 'Not a description or a comment.' }, 400);
	if (!isTaskToggle(b)) return c.json({ error: 'Not a checkbox.' }, 400);
	const blockedEverywhere = writeBlockForEveryRepo(c.env);
	if (blockedEverywhere) return c.json({ error: blockedEverywhere }, 403);
	const token = await userToken(c.env, c.get('user'));
	const read = await graphql<{ node?: TaskBody | null }>(token, TASK_BODY_QUERY, {
		id: b.id
	}).catch(() => null);
	if (!read?.ok || read.errors.length)
		return c.json({ error: read?.errors[0]?.message ?? 'GitHub could not read the text.' }, 502);
	const node = read.data?.node;
	const update = node ? UPDATES[node.__typename] : undefined;
	const parent = node ? parentOf(node) : null;
	if (!node || !update || !parent)
		return c.json({ error: 'GitHub did not find this description or comment.' }, 404);
	const blocked = writeBlockForRepo(c.env, parent.repository.nameWithOwner);
	if (blocked) return c.json({ error: blocked }, 403);
	if (!node.viewerCanUpdate)
		return c.json({ error: 'You cannot change this description or comment.' }, 403);
	const toggled = toggleTask(node.body, b);
	if (!toggled.ok)
		return c.json(
			{
				error:
					toggled.reason === 'changed'
						? 'This checklist changed on GitHub. Hush loaded it again.'
						: 'Hush cannot find this checkbox in the Markdown. Change it on GitHub.'
			},
			409
		);
	const { mutation, idField, resultField } = update;
	const result = await graphql<
		Record<string, Record<string, { body: string; bodyHTML: string }> | null>
	>(
		token,
		`mutation($id: ID!, $body: String!) { ${mutation}(input: { ${idField}: $id, body: $body }) { ${resultField} { body bodyHTML } } }`,
		{ id: b.id, body: toggled.body }
	).catch(() => null);
	const saved = result?.data?.[mutation]?.[resultField];
	if (!result?.ok || result.errors.length || !saved)
		return c.json(
			{ error: result?.errors[0]?.message ?? 'GitHub could not save the checkbox.' },
			result ? failedWriteStatus(result.status) : 502
		);
	refreshWrittenSubject(c, { repo: parent.repository.nameWithOwner, number: parent.number });
	return c.json({ body: saved.body, html: saved.bodyHTML });
});

export default app;
