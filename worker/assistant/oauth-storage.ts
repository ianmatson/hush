export interface OAuthRecord {
	value: string;
	expiration?: number;
	metadata?: unknown;
}

export function oauthStorage(storage: DurableObjectStorage, readOnly = false) {
	const prefix = 'oauth:';
	const alive = (record: OAuthRecord) =>
		!record.expiration || record.expiration > Date.now() / 1000;
	return {
		async get(key: string, options?: { type?: string } | string) {
			const record = await storage.get<OAuthRecord>(prefix + key);
			if (!record || !alive(record)) return null;
			return (typeof options === 'string' ? options : options?.type) === 'json'
				? JSON.parse(record.value)
				: record.value;
		},
		async put(
			key: string,
			value: string,
			options?: { expiration?: number; expirationTtl?: number; metadata?: unknown }
		) {
			if (readOnly) throw new Error('OAuth validation attempted a write');
			await storage.put(prefix + key, {
				value,
				expiration:
					options?.expiration ??
					(options?.expirationTtl
						? Math.floor(Date.now() / 1000) + options.expirationTtl
						: undefined),
				metadata: options?.metadata
			} satisfies OAuthRecord);
		},
		async delete(key: string) {
			if (readOnly) throw new Error('OAuth validation attempted a delete');
			await storage.delete(prefix + key);
		},
		async list(options: { prefix?: string; cursor?: string; limit?: number } = {}) {
			const limit = Math.min(1000, Math.max(1, options.limit ?? 1000));
			const records = await storage.list<OAuthRecord>({
				prefix: prefix + (options.prefix ?? ''),
				limit: limit + 1,
				...(options.cursor ? { startAfter: prefix + options.cursor } : {})
			});
			const entries = [...records];
			const scanned = entries.slice(0, limit);
			const selected = scanned.filter(([, record]) => alive(record));
			const complete = entries.length <= limit;
			return {
				keys: selected.map(([key, record]) => ({
					name: key.slice(prefix.length),
					expiration: record.expiration,
					metadata: record.metadata
				})),
				list_complete: complete,
				cursor: complete ? '' : scanned.at(-1)![0].slice(prefix.length),
				cacheStatus: null
			};
		}
	};
}
