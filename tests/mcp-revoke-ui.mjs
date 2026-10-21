import assert from 'node:assert/strict';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const playwright = await import(
	process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright'
);
const origin = process.env.UI_BASE_URL ?? 'http://127.0.0.1:5173';
const artifacts = process.env.UI_ARTIFACTS ?? '/tmp/hush-mcp-revoke-dialog-v2';
const phase = process.env.UI_PHASE ?? 'after';
await mkdir(artifacts, { recursive: true });
if (
	await access(`${artifacts}/${phase}-report.json`).then(
		() => true,
		() => false
	)
)
	throw new Error('Use another artifact folder to preserve the existing capture.');
const browser = await playwright.chromium.launch({
	headless: true,
	executablePath: process.env.UI_BROWSER_EXECUTABLE
});
const report = { phase, console: [], unexpectedApi: [], checks: [], screenshots: [] };
try {
	for (const width of [400, 1440])
		for (const mode of ['light', 'dark']) {
			const context = await browser.newContext({
				viewport: { width, height: 1000 },
				colorScheme: mode,
				serviceWorkers: 'block'
			});
			await context.route('**/*', (route) =>
				new URL(route.request().url()).origin === origin
					? route.continue()
					: route.abort('blockedbyclient')
			);
			await context.routeWebSocket('**/api/live', (socket) =>
				socket.onMessage((message) => {
					if (message === 'ping') socket.send('pong');
				})
			);
			const page = await context.newPage();
			page.on('pageerror', (error) => report.console.push({ width, mode, error: error.message }));
			page.on('console', (message) => {
				if (message.type() === 'error') report.console.push({ width, mode, error: message.text() });
			});
			await page.goto(`${origin}/icon.svg`);
			const settings = await page.evaluate(async () =>
				structuredClone((await import('/src/lib/shared/settings.ts')).DEFAULT_SETTINGS)
			);
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
				}
			];
			const requests = [];
			let fail = false;
			await context.route('**/api/**', async (route) => {
				const path = new URL(route.request().url()).pathname;
				if (path.endsWith('/revoke')) {
					requests.push({ path, body: route.request().postDataJSON() });
					await new Promise((resolve) => setTimeout(resolve, 500));
					if (!fail) grants = [];
					return route.fulfill({
						status: fail ? 403 : 200,
						json: fail ? { error: 'Synthetic revocation failed.' } : { ok: true }
					});
				}
				const fixtures = {
					'/api/me': {
						login: 'hush-fixture',
						name: 'Hush Fixture',
						avatarUrl: null,
						settings,
						lastPollAt: null,
						nextPollAt: null,
						lastPollError: null,
						scopes: ['notifications', 'repo'],
						tokenSource: 'app',
						smartDecisionsPaused: false,
						smartDecisionsChecking: false
					},
					'/api/mcp/grants': {
						resource: `${origin}/mcp`,
						grants,
						csrfToken: 'synthetic-grants-csrf'
					},
					'/api/alerts': [],
					'/api/dashboard/pr': { items: [], sections: [], refreshing: false },
					'/api/dashboard/issue': { items: [], sections: [], refreshing: false },
					'/api/account/sessions': [],
					'/api/account/orgs': { available: true, orgs: [], approveUrl: 'https://example.test' }
				};
				if (!(path in fixtures)) report.unexpectedApi.push(path);
				return route.fulfill({
					status: path in fixtures ? 200 : 501,
					json: fixtures[path] ?? { error: 'No synthetic fixture.' }
				});
			});
			await page.goto(`${origin}/settings/general`);
			await page
				.getByRole('radio', { name: mode === 'light' ? 'Light' : 'Dark', exact: true })
				.click();
			await page.goto(`${origin}/settings/apps`);
			const trigger = page.getByRole('button', {
				name: 'Revoke access for Example assistant',
				exact: true
			});
			const cancel = page.getByRole('button', { name: 'Cancel', exact: true });
			await trigger.click();
			await page.getByRole('button', { name: 'Confirm revocation', exact: true }).waitFor();
			await page.evaluate(() => document.fonts.ready);
			await page.screenshot({
				path: `${artifacts}/${phase}-revoke-${mode}-${width}.png`,
				animations: 'disabled',
				fullPage: true
			});
			report.screenshots.push(`${phase}-revoke-${mode}-${width}.png`);
			assert.equal(
				await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
				true
			);
			if (phase === 'after') {
				const dialog = page.getByRole('dialog', { name: 'Revoke app access?' });
				await dialog.waitFor();
				assert.equal(await cancel.evaluate((element) => element === document.activeElement), true);
				await page.keyboard.press('Shift+Tab');
				assert.equal(
					await dialog
						.getByRole('button', { name: 'Confirm revocation', exact: true })
						.evaluate((element) => element === document.activeElement),
					true
				);
				await page.keyboard.press('Tab');
				assert.equal(await cancel.evaluate((element) => element === document.activeElement), true);
				await page.keyboard.press('Escape');
				await dialog.waitFor({ state: 'hidden' });
				await page.waitForFunction(
					() =>
						document.activeElement?.getAttribute('aria-label') ===
						'Revoke access for Example assistant'
				);
				assert.equal(await trigger.evaluate((element) => element === document.activeElement), true);
				assert.equal(requests.length, 0);
				await trigger.click();
				await cancel.click();
				await dialog.waitFor({ state: 'hidden' });
				await page.waitForFunction(
					() =>
						document.activeElement?.getAttribute('aria-label') ===
						'Revoke access for Example assistant'
				);
				assert.equal(await trigger.evaluate((element) => element === document.activeElement), true);
				assert.equal(requests.length, 0);
				await trigger.click();
				report.checks.push(
					`Modal focus, Tab trap, Escape, Cancel and focus restoration at ${width}/${mode}`
				);
			}
			if (width === 1440 && mode === 'light') {
				await cancel.click();
				await mkdir(`${artifacts}/${phase}-revoke-frames`, { recursive: true });
				for (let frame = 0; frame < 36; frame++) {
					if (frame === 8) await trigger.click();
					if (frame === 26) await cancel.click();
					await page.screenshot({
						path: `${artifacts}/${phase}-revoke-frames/${String(frame).padStart(3, '0')}.png`,
						clip: { x: 320, y: 180, width: 800, height: 650 }
					});
					await page.waitForTimeout(83);
				}
				await trigger.click();
			}
			if (phase === 'after') {
				const dialog = page.getByRole('dialog', { name: 'Revoke app access?' });
				if (width === 400 && mode === 'light') {
					await page.setViewportSize({ width: 320, height: 900 });
					await page.emulateMedia({ reducedMotion: 'reduce' });
					await page.screenshot({
						path: `${artifacts}/after-revoke-light-320.png`,
						animations: 'disabled',
						fullPage: true
					});
					assert.equal(
						await dialog.evaluate((element) => getComputedStyle(element).animationName),
						'none'
					);
					assert.equal(
						await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
						true
					);
					fail = true;
					await dialog.getByRole('button', { name: 'Confirm revocation', exact: true }).click();
					await dialog.getByRole('alert').waitFor();
					await page.screenshot({
						path: `${artifacts}/after-revoke-error-320.png`,
						animations: 'disabled',
						fullPage: true
					});
					assert.equal(await dialog.getByText('Synthetic revocation failed.').isVisible(), true);
					fail = false;
					report.checks.push(
						'Error remains in dialog; retry available; 320px reduced-motion layout'
					);
				}
				await dialog.getByRole('button', { name: 'Confirm revocation', exact: true }).click();
				await page.getByRole('button', { name: 'Revoking…', exact: true }).waitFor();
				assert.equal(await cancel.isDisabled(), true);
				await page.keyboard.press('Escape');
				await page.mouse.click(10, 10);
				assert.equal(await dialog.isVisible(), true);
				await page.getByRole('heading', { name: 'No authorized apps', exact: true }).waitFor();
				await dialog.waitFor({ state: 'hidden' });
				await page.waitForFunction(
					() =>
						document.activeElement?.tagName === 'H1' &&
						document.activeElement.textContent?.trim() === 'Authorized apps'
				);
				assert.equal(
					await page
						.getByRole('heading', { name: 'Authorized apps', exact: true })
						.evaluate((element) => element === document.activeElement),
					true
				);
				assert.deepEqual(requests.at(-1), {
					path: '/api/mcp/grants/synthetic-grant/revoke',
					body: { csrfToken: 'synthetic-grants-csrf' }
				});
				assert.equal(requests.length, width === 400 && mode === 'light' ? 2 : 1);
				report.checks.push(
					`Pending state prevents dismissal, successful revoke closes dialog and restores focus at ${width}/${mode}`
				);
			}
			await context.close();
		}
} finally {
	await writeFile(`${artifacts}/${phase}-report.json`, JSON.stringify(report, null, 2));
	await browser.close();
}
assert.deepEqual(report.unexpectedApi, []);
console.log(JSON.stringify(report, null, 2));
