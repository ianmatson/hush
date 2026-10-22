import { createHmac, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

const [event, file, url = 'http://localhost:8787/api/github/webhook'] = process.argv.slice(2);
if (!event || !file) {
	console.error('Usage: pnpm webhook:replay <event> <payload.json> [url]');
	process.exit(2);
}
const secret = readFileSync('.dev.vars', 'utf8').match(/^GITHUB_WEBHOOK_SECRET=(.+)$/m)?.[1];
if (!secret) {
	console.error('GITHUB_WEBHOOK_SECRET is not in .dev.vars.');
	process.exit(2);
}
const body = readFileSync(file);
const signature = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
const res = await fetch(url, {
	method: 'POST',
	headers: {
		'Content-Type': 'application/json',
		'X-GitHub-Event': event,
		'X-GitHub-Delivery': randomUUID(),
		'X-Hub-Signature-256': signature
	},
	body
});
console.log(res.status, await res.text());
