import assert from 'node:assert/strict';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const playwright = await import(
	process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright'
);
const origin = process.env.UI_BASE_URL ?? 'http://127.0.0.1:5173';
const artifacts = process.env.UI_ARTIFACTS ?? '/tmp/hush-mcp-ui';
const phase = process.env.UI_PHASE ?? 'after';
await mkdir(artifacts, { recursive: true });
const existingReport = await access(`${artifacts}/${phase}-report.json`).then(
	() => true,
	() => false
);
if (phase === 'before' && existingReport)
	throw new Error(`Before screenshots already exist in ${artifacts}. Use another UI_ARTIFACTS.`);
const browser = await playwright.chromium.launch({
	headless: true,
	executablePath: process.env.UI_BROWSER_EXECUTABLE
});
const report = { phase, console: [], unexpectedApi: [], screenshots: [], checks: [] };

async function capture(page, name) {
	await page.evaluate(() => document.fonts.ready);
	await page.screenshot({ path: `${artifacts}/${name}.png`, fullPage: true });
	report.screenshots.push(`${name}.png`);
	assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
}

async function frames(page, name, clip, action) {
	await mkdir(`${artifacts}/${name}-frames`, { recursive: true });
	for (let frame = 0; frame < 36; frame++) {
		await action(frame);
		await page.screenshot({
			path: `${artifacts}/${name}-frames/${String(frame).padStart(3, '0')}.png`,
			clip
		});
		await page.waitForTimeout(83);
	}
}

try {
	for (const width of [400, 1440]) {
		for (const mode of ['light', 'dark']) {
			const context = await browser.newContext({
				viewport: { width, height: 1000 },
				colorScheme: mode,
				serviceWorkers: 'block'
			});
			await context.route('**/*', (route) => {
				const url = new URL(route.request().url());
				return url.origin === origin ? route.continue() : route.abort('blockedbyclient');
			});
			await context.routeWebSocket('**/api/live', (socket) => {
				socket.onMessage((message) => {
					if (message === 'ping') socket.send('pong');
				});
			});
			const page = await context.newPage();
			page.on('pageerror', (error) => report.console.push({ width, mode, error: error.message }));
			page.on('console', (message) => {
				if (message.type() === 'error') report.console.push({ width, mode, error: message.text() });
			});
			await page.goto(`${origin}/icon.svg`);
			const settings = await page.evaluate(async () => {
				const module = await import('/src/lib/shared/settings.ts');
				return structuredClone(module.DEFAULT_SETTINGS);
			});
			const me = {
				login: 'hush-fixture',
				name: 'Hush Fixture',
				avatarUrl: null,
				settings,
				lastPollAt: null,
				nextPollAt: null,
				lastPollError: null,
				scopes: ['notifications', 'repo', 'read:org', 'project'],
				tokenSource: 'app',
				smartDecisionsPaused: false,
				smartDecisionsChecking: false
			};
			let scenario = 'success';
			let grants = [
				{
					id: 'synthetic-grant',
					clientId: 'synthetic-client',
					clientName: 'Example assistant',
					createdAt: Date.now() - 86400000,
					expiresAt: Date.now() + 86400000,
					scope: 'saved-views:read',
					views: [{ id: 'mine', name: 'Mine' }],
					status: 'active'
				},
				{
					id: 'synthetic-expired-grant',
					clientId: 'synthetic-expired-client',
					clientName: 'Previous assistant',
					createdAt: Date.now() - 172800000,
					expiresAt: Date.now() - 86400000,
					scope: 'saved-views:read',
					views: [{ id: 'team', name: 'Team review queue' }],
					status: 'expired'
				}
			];
			const requests = [];
			await context.route(`${origin}/synthetic-callback`, (route) =>
				route.fulfill({ contentType: 'text/html', body: '<h1>Synthetic callback</h1>' })
			);
			await context.route('**/api/**', async (route) => {
				const path = new URL(route.request().url()).pathname;
				const method = route.request().method();
				if (path === '/api/mcp/consent') {
					if (method === 'POST') {
						requests.push({ path, body: route.request().postDataJSON() });
						await new Promise((resolve) => setTimeout(resolve, 150));
						return route.fulfill({
							status: scenario === 'submit-error' ? 403 : 200,
							json:
								scenario === 'submit-error'
									? { error: 'Synthetic request expired. Connect the app again.' }
									: { redirectTo: '/synthetic-callback' }
						});
					}
					if (scenario === 'consent-error')
						return route.fulfill({
							status: 410,
							json: { error: 'Synthetic request expired. Connect the app again.' }
						});
					if (scenario === 'signed-out')
						return route.fulfill({ status: 401, json: { error: 'Not signed in.' } });
					return route.fulfill({
						json: {
							requestId: 'synthetic-request',
							csrfToken: 'synthetic-consent-csrf',
							client: {
								id: 'synthetic-client',
								name: 'Example assistant',
								redirectUri: 'https://client.example.test/callback'
							},
							scope: 'saved-views:read',
							views:
								scenario === 'empty-views'
									? []
									: [
											{ id: 'mine', name: 'Mine', searches: ['is:open involves:@me'] },
											{
												id: 'team',
												name: 'Team review queue',
												searches: ['is:pr is:open repo:example/public-project review-requested:@me']
											}
										],
							expiresAt:
								scenario === 'expired-request'
									? Date.now() - 1000
									: scenario === 'expires-while-open'
										? Date.now() + 1500
										: Date.now() + 600000
						}
					});
				}
				if (path === '/api/mcp/grants')
					return route.fulfill({
						status: scenario === 'grants-error' ? 503 : 200,
						json:
							scenario === 'grants-error'
								? { error: 'Synthetic server unavailable.' }
								: { resource: `${origin}/mcp`, grants, csrfToken: 'synthetic-grants-csrf' }
					});
				if (path.endsWith('/revoke')) {
					requests.push({ path, body: route.request().postDataJSON() });
					if (scenario === 'revoke-error')
						return route.fulfill({ status: 403, json: { error: 'Synthetic revocation failed.' } });
					grants = grants.filter((grant) => !path.includes(grant.id));
					return route.fulfill({ json: { ok: true } });
				}
				const fixtures = {
					'/api/me': me,
					'/api/account/sessions': [],
					'/api/account/orgs': { available: true, orgs: [], approveUrl: 'https://example.test' },
					'/api/alerts': [],
					'/api/dashboard/pr': { items: [], sections: [], refreshing: false },
					'/api/dashboard/issue': { items: [], sections: [], refreshing: false }
				};
				if (!(path in fixtures))
					report.unexpectedApi.push({ path, method: route.request().method() });
				await route.fulfill({
					status: path in fixtures ? 200 : 501,
					json: fixtures[path] ?? { error: 'No synthetic fixture for this request.' }
				});
			});
			await page.goto(`${origin}/settings/general`);
			await page.getByRole('heading', { name: 'Appearance', exact: true }).waitFor();
			await page
				.getByRole('radio', { name: mode === 'light' ? 'Light' : 'Dark', exact: true })
				.click();
			if (phase === 'after') {
				await capture(page, `after-general-${mode}-${width}`);
				await page.goto(`${origin}/settings/apps`);
				await page.getByRole('heading', { name: 'Example assistant', exact: true }).waitFor();
			}
			await capture(page, `${phase}-settings-${mode}-${width}`);
			if (width === 1440 && mode === 'light' && phase === 'before') {
				await mkdir(`${artifacts}/before-settings-frames`, { recursive: true });
				for (let frame = 0; frame < 36; frame++) {
					if (frame === 8) await page.getByRole('radio', { name: 'Dark', exact: true }).hover();
					if (frame === 16) await page.getByRole('radio', { name: 'Dark', exact: true }).click();
					if (frame === 28) await page.getByRole('radio', { name: 'Light', exact: true }).click();
					await page.screenshot({
						path: `${artifacts}/before-settings-frames/${String(frame).padStart(3, '0')}.png`,
						clip: { x: 320, y: 60, width: 800, height: 650 }
					});
					await page.waitForTimeout(83);
				}
			}
			await page.goto(`${origin}/oauth/consent?request=synthetic-request`);
			await page.waitForLoadState('networkidle');
			await capture(page, `${phase}-consent-${mode}-${width}`);
			if (phase === 'after') {
				const authorize = page.getByRole('button', {
					name: 'Authorize selected views',
					exact: true
				});
				assert.equal(await authorize.isDisabled(), true);
				assert.equal(await page.getByRole('checkbox', { checked: true }).count(), 0);
				await page.getByText('https://client.example.test', { exact: true }).waitFor();
				await page.getByText('Hush did not verify it.', { exact: false }).waitFor();
				await page.getByText('This request expires at', { exact: false }).waitFor();
				await page.getByRole('checkbox', { name: /Mine/ }).focus();
				await page.keyboard.press('Space');
				assert.equal(await authorize.isEnabled(), true);
				await authorize.click();
				assert.equal(await page.getByRole('button', { name: 'Authorizing…' }).isDisabled(), true);
				await page.waitForURL(`${origin}/synthetic-callback`);
				assert.deepEqual(requests.at(-1).body, {
					requestId: 'synthetic-request',
					csrfToken: 'synthetic-consent-csrf',
					viewIds: ['mine'],
					decision: 'allow'
				});
				report.checks.push(`Allow selected view with CSRF and keyboard at ${width}/${mode}`);
			}
			if (phase === 'after' && width === 1440 && mode === 'light') {
				await page.goto(`${origin}/settings/apps`);
				await page.getByRole('heading', { name: 'Example assistant', exact: true }).waitFor();
				await frames(
					page,
					'after-settings-interaction',
					{ x: 472, y: 60, width: 696, height: 800 },
					async (frame) => {
						if (frame === 6)
							await page
								.getByRole('button', { name: 'Revoke access for Example assistant', exact: true })
								.hover();
						if (frame === 12)
							await page
								.getByRole('button', { name: 'Revoke access for Example assistant', exact: true })
								.click();
						if (frame === 26)
							await page.getByRole('button', { name: 'Cancel', exact: true }).click();
					}
				);
				await page.goto(`${origin}/oauth/consent?request=synthetic-request`);
				await page.getByRole('checkbox', { name: /Mine/ }).waitFor();
				await frames(
					page,
					'after-consent-interaction',
					{ x: 320, y: 60, width: 800, height: 800 },
					async (frame) => {
						if (frame === 8) await page.getByRole('checkbox', { name: /Mine/ }).click();
						if (frame === 18)
							await page.getByRole('checkbox', { name: /Team review queue/ }).focus();
						if (frame === 22) await page.keyboard.press('Space');
						if (frame === 30) await page.getByRole('checkbox', { name: /Mine/ }).click();
					}
				);
			}
			if (phase === 'after' && width === 400 && mode === 'light') {
				await page.goto(`${origin}/oauth/consent?request=synthetic-request`);
				await page.getByRole('button', { name: 'Deny access', exact: true }).click();
				await page.waitForURL(`${origin}/synthetic-callback`);
				assert.deepEqual(requests.at(-1).body, {
					requestId: 'synthetic-request',
					csrfToken: 'synthetic-consent-csrf',
					viewIds: [],
					decision: 'deny'
				});
				report.checks.push('Deny access sends no views');
				for (const state of [
					'submit-error',
					'empty-views',
					'expired-request',
					'consent-error',
					'signed-out',
					'expires-while-open'
				]) {
					scenario = state;
					await page.goto(`${origin}/oauth/consent?request=synthetic-request`);
					if (state === 'submit-error') {
						await page.getByRole('checkbox', { name: /Mine/ }).click();
						await page
							.getByRole('button', { name: 'Authorize selected views', exact: true })
							.click();
						await page
							.getByRole('alert')
							.filter({ hasText: 'Synthetic request expired.' })
							.waitFor();
						assert.equal(await page.getByRole('checkbox', { name: /Mine/ }).isChecked(), true);
					} else if (state === 'empty-views') {
						await page.getByText('No saved views are available.', { exact: false }).waitFor();
						assert.equal(
							await page
								.getByRole('button', { name: 'Authorize selected views', exact: true })
								.isDisabled(),
							true
						);
					} else if (state === 'signed-out') {
						await page.getByText('Sign in to Hush first', { exact: true }).waitFor();
						assert.equal(
							await page
								.getByRole('link', { name: 'Sign in with GitHub', exact: true })
								.getAttribute('href'),
							'/api/auth/github'
						);
					} else if (state === 'expires-while-open') {
						await page.getByRole('checkbox', { name: /Mine/ }).click();
						await page.getByText('Request expired', { exact: true }).waitFor();
						assert.equal(
							await page
								.getByRole('button', { name: 'Authorize selected views', exact: true })
								.isDisabled(),
							true
						);
						assert.equal(
							await page.getByRole('button', { name: 'Deny access', exact: true }).isDisabled(),
							true
						);
					} else await page.getByRole('alert').waitFor();
					await capture(page, `after-consent-${state}`);
					report.checks.push(`Consent ${state}`);
				}
				scenario = 'success';
				await page.goto(`${origin}/oauth/consent`);
				await page.getByRole('alert').filter({ hasText: 'incomplete' }).waitFor();
				report.checks.push('Missing consent request is rejected');
				scenario = 'grants-error';
				await page.goto(`${origin}/settings/apps`);
				await page.getByRole('alert').waitFor();
				await capture(page, 'after-settings-load-error');
				scenario = 'success';
				await page.getByRole('button', { name: 'Retry', exact: true }).click();
				await page.getByRole('heading', { name: 'Example assistant', exact: true }).waitFor();
				report.checks.push('Grants load error and retry');
				scenario = 'revoke-error';
				await page
					.getByRole('button', { name: 'Revoke access for Example assistant', exact: true })
					.click();
				assert.equal(
					await page
						.getByRole('button', { name: 'Cancel', exact: true })
						.evaluate((element) => element === document.activeElement),
					true
				);
				await page.getByRole('button', { name: 'Confirm revocation', exact: true }).click();
				await page.getByRole('alert').filter({ hasText: 'Synthetic revocation failed.' }).waitFor();
				await capture(page, 'after-settings-revoke-error');
				scenario = 'success';
				await page.getByRole('button', { name: 'Confirm revocation', exact: true }).click();
				await page
					.getByRole('status')
					.filter({ hasText: 'Access revoked for Example assistant.' })
					.waitFor();
				assert.deepEqual(requests.at(-1), {
					path: '/api/mcp/grants/synthetic-grant/revoke',
					body: { csrfToken: 'synthetic-grants-csrf' }
				});
				assert.equal(
					await page.getByRole('heading', { name: 'Example assistant', exact: true }).count(),
					0
				);
				report.checks.push('Revoke confirms, forwards CSRF, handles failure, and removes grant');
				grants = [];
				await page.reload();
				await page.getByRole('heading', { name: 'No authorized apps', exact: true }).waitFor();
				await capture(page, 'after-settings-empty');
				await page.setViewportSize({ width: 320, height: 900 });
				await page.emulateMedia({ reducedMotion: 'reduce' });
				await capture(page, 'after-settings-320');
				await page.goto(`${origin}/oauth/consent?request=synthetic-request`);
				await page.getByRole('checkbox', { name: /Mine/ }).waitFor();
				await capture(page, 'after-consent-320');
				report.checks.push('No horizontal overflow at 320px with reduced motion');
			}
			await context.close();
		}
	}
} finally {
	await writeFile(`${artifacts}/${phase}-report.json`, JSON.stringify(report, null, 2));
	await browser.close();
}

console.log(JSON.stringify(report, null, 2));
assert.deepEqual(report.unexpectedApi, []);
