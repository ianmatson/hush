import { DurableObject } from 'cloudflare:workers';
import type { Env } from './db';

export class Poller extends DurableObject<Env> {
	async exportSettings(): Promise<string | null> {
		await this.ctx.storage.deleteAlarm();
		return (await this.ctx.storage.get<string>('settings')) ?? null;
	}

	async alarm(): Promise<void> {
		await this.ctx.storage.deleteAlarm();
	}

	async fetch(): Promise<Response> {
		return new Response('Gone', { status: 410 });
	}
}
