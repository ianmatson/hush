import { DurableObject } from 'cloudflare:workers';
import type { Env } from './db';

export interface LegacyDevice {
	endpoint: string;
	p256dh: string;
	auth: string;
	label: string | null;
	createdAt: number;
}

export interface LegacyExport {
	settings: string | null;
	devices: LegacyDevice[];
}

export class Poller extends DurableObject<Env> {
	private devices(): LegacyDevice[] {
		try {
			return this.ctx.storage.sql
				.exec<LegacyDevice & Record<string, SqlStorageValue>>(
					'SELECT endpoint, p256dh, auth, label, created_at AS createdAt FROM push_devices'
				)
				.toArray();
		} catch {
			return [];
		}
	}

	async exportLegacy(): Promise<LegacyExport> {
		await this.ctx.storage.deleteAlarm();
		return {
			settings: (await this.ctx.storage.get<string>('settings')) ?? null,
			devices: this.devices()
		};
	}

	async forget(): Promise<void> {
		await this.ctx.storage.deleteAlarm();
		await this.ctx.storage.deleteAll();
	}

	async alarm(): Promise<void> {
		await this.ctx.storage.deleteAlarm();
	}

	async fetch(): Promise<Response> {
		return new Response('Gone', { status: 410 });
	}
}
