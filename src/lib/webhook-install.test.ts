import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebhookAccess } from '$lib/shared/types';

const installed: WebhookAccess = {
	available: true,
	accounts: [
		{
			login: 'ian',
			kind: 'user',
			state: 'installed',
			selection: 'all',
			url: 'https://github.com/settings/installations/1'
		}
	]
};
const missing: WebhookAccess = {
	available: true,
	accounts: [{ ...installed.accounts[0], state: 'missing', selection: null }]
};

vi.mock('$lib/api', () => ({ api: { webhooks: vi.fn() }, ApiError: class extends Error {} }));

const { api } = await import('$lib/api');
const { keys, queryClient, webhooksQuery } = await import('$lib/queries');
const { refreshWebhooksAfterInstall } = await import('./webhook-install');

describe('refreshWebhooksAfterInstall', () => {
	beforeEach(() => {
		queryClient.clear();
		vi.mocked(api.webhooks).mockReset();
	});

	it('reads the installations again even when the cached list is fresh', async () => {
		queryClient.setQueryData(keys.webhooks, missing);
		vi.mocked(api.webhooks).mockResolvedValue(installed);
		await refreshWebhooksAfterInstall();
		expect(api.webhooks).toHaveBeenCalledWith(true);
		expect(queryClient.getQueryData(keys.webhooks)).toEqual(installed);
	});

	it('replaces the result of a read that was already running', async () => {
		let answerOld: (access: WebhookAccess) => void = () => {};
		vi.mocked(api.webhooks)
			.mockImplementationOnce(() => new Promise((resolve) => (answerOld = resolve)))
			.mockResolvedValueOnce(installed);
		const running = queryClient.fetchQuery(webhooksQuery()).catch(() => null);
		await refreshWebhooksAfterInstall();
		answerOld(missing);
		await running;
		expect(api.webhooks).toHaveBeenLastCalledWith(true);
		expect(queryClient.getQueryData(keys.webhooks)).toEqual(installed);
	});
});
