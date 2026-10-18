import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('cloudflare:workers', () => ({ DurableObject: class {} }));
vi.mock('../github', () => ({ fetchTeams: vi.fn() }));
vi.mock('../db', () => ({
	getUser: vi.fn(),
	parseSettings: vi.fn(),
	userToken: vi.fn(async () => 'token')
}));

const { PollerBase } = await import('../poller/base');
const { fetchTeams } = await import('../github');

class TestBase extends PollerBase {}

const team = { slug: 'acme/web', name: 'Web', org: 'acme' };

function harness() {
	const values = new Map<string, unknown>();
	const poller = Object.assign(Object.create(TestBase.prototype) as TestBase, {
		ctx: {
			storage: {
				get: async (key: string) => structuredClone(values.get(key)),
				put: async (key: string, value: unknown) => {
					values.set(key, structuredClone(value));
				}
			}
		},
		account: async () => ({ id: 1, login: 'ian' })
	});
	return { poller, values };
}

describe('team lookup', () => {
	beforeEach(() => vi.clearAllMocks());

	it('does not remember a failed lookup as no teams', async () => {
		const { poller, values } = harness();
		vi.mocked(fetchTeams).mockResolvedValueOnce({
			teams: [],
			error: 'GitHub returned 502 for your teams.'
		});
		expect(await poller.teams()).toEqual({
			teams: [],
			error: 'GitHub returned 502 for your teams.'
		});
		expect(values.has('teams')).toBe(false);
	});

	it('keeps the teams it knew when a lookup fails', async () => {
		const { poller, values } = harness();
		values.set('teams', { teams: [team], at: 0 });
		vi.mocked(fetchTeams).mockResolvedValueOnce({ teams: [], error: 'SAML enforcement' });
		expect(await poller.teams()).toEqual({ teams: [team], error: 'SAML enforcement' });
		expect(values.get('teams')).toEqual({ teams: [team], at: 0 });
	});

	it('asks GitHub again a minute after a failure, and then remembers the answer', async () => {
		const { poller, values } = harness();
		vi.useFakeTimers();
		try {
			vi.mocked(fetchTeams)
				.mockRejectedValueOnce(new TypeError('Network connection lost'))
				.mockResolvedValueOnce({ teams: [team] });
			expect((await poller.teams()).error).toBe('GitHub did not answer for your teams.');
			expect((await poller.teams()).error).toBe('GitHub did not answer for your teams.');
			expect(fetchTeams).toHaveBeenCalledTimes(1);
			vi.advanceTimersByTime(60_000);
			expect(await poller.teams()).toEqual({ teams: [team] });
			expect(values.get('teams')).toMatchObject({ teams: [team] });
		} finally {
			vi.useRealTimers();
		}
	});
});
