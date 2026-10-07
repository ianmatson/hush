export type ChannelSend = () => Promise<boolean>;

export async function deliveredByAnyChannel(sends: ChannelSend[]): Promise<boolean> {
	const sent = await Promise.allSettled(sends.map((send) => send()));
	for (const s of sent) if (s.status === 'rejected') console.error('alert failed', s.reason);
	return sent.some((s) => s.status === 'fulfilled' && s.value);
}
