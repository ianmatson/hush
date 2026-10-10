import {
	ATTACH_NEEDS_WRITE,
	MAX_ATTACHMENT_BYTES,
	attachmentKind,
	attachmentName
} from '../../src/lib/shared/attachments';
import { userToken } from '../db';
import { gh } from '../github';
import { query, routes } from '../app';
import { writeBlockForRepo } from '../write-gate';

const NAME = /^(?!\.+$)[A-Za-z0-9_.-]{1,100}$/;
const UPLOAD_URL = 'https://uploads.github.com/user-attachments/assets';
const UPLOAD_WAIT_MS = 120_000;

type RepoAnswer = { id?: number; permissions?: { push?: boolean } };

async function uploadRefusal(res: Response): Promise<string> {
	if (res.status === 404) return ATTACH_NEEDS_WRITE;
	if (res.status === 429) return 'GitHub is limiting uploads. Wait a minute and try again.';
	const j = (await res.json().catch(() => ({}))) as { message?: string };
	return j.message || `GitHub returned ${res.status}.`;
}

const app = routes().post(
	'/api/attachments',
	query<{ repo: string; name: string; type: string }>(),
	async (c) => {
		const { repo = '', name = '', type = '' } = c.req.valid('query');
		const [owner, repoName, extra] = repo.split('/');
		if (!NAME.test(owner ?? '') || !NAME.test(repoName ?? '') || extra !== undefined)
			return c.json({ error: 'Not a repository.' }, 400);
		const blocked = writeBlockForRepo(c.env, repo);
		if (blocked) return c.json({ error: blocked }, 403);
		const kind = attachmentKind(type);
		if (!kind) return c.json({ error: 'GitHub does not accept this type of file.' }, 415);
		const size = Number(c.req.header('Content-Length'));
		const body = c.req.raw.body;
		if (!body || !Number.isInteger(size) || size < 1)
			return c.json({ error: 'The file is empty.' }, 400);
		if (size > MAX_ATTACHMENT_BYTES[kind]) return c.json({ error: 'The file is too large.' }, 413);

		const token = await userToken(c.env, c.get('user'));
		const repoRes = await gh(token, `/repos/${repo}`);
		if (!repoRes.ok) return c.json({ error: 'Hush could not read the repository.' }, 502);
		const repoAnswer = (await repoRes.json()) as RepoAnswer;
		if (!repoAnswer.id) return c.json({ error: 'Hush could not read the repository.' }, 502);
		if (repoAnswer.permissions?.push === false) return c.json({ error: ATTACH_NEEDS_WRITE }, 403);

		const target = new URL(UPLOAD_URL);
		target.searchParams.set('name', attachmentName(name));
		target.searchParams.set('content_type', type);
		target.searchParams.set('repository_id', String(repoAnswer.id));
		const sized = new FixedLengthStream(size);
		c.executionCtx.waitUntil(body.pipeTo(sized.writable).catch(() => {}));
		const res = await gh(token, target.toString(), {
			method: 'POST',
			body: sized.readable,
			headers: { 'Content-Type': 'application/octet-stream' },
			signal: AbortSignal.timeout(UPLOAD_WAIT_MS)
		});
		if (!res.ok) return c.json({ error: await uploadRefusal(res) }, 422);
		const asset = (await res.json().catch(() => ({}))) as { url?: string };
		if (!asset.url) return c.json({ error: 'GitHub returned no address for the file.' }, 502);
		return c.json({ url: asset.url, kind });
	}
);

export default app;
