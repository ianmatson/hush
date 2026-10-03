// Web Push with only WebCrypto: RFC 8291 (aes128gcm payload encryption) + RFC 8292 (VAPID).
import { b64urlDecode, b64urlEncode } from './crypto';

const enc = new TextEncoder();

export interface PushSubscriptionKeys {
	endpoint: string;
	p256dh: string;
	auth: string;
}

export interface Vapid {
	publicKey: string; // base64url, 65-byte uncompressed P-256 point
	privateKey: string; // base64url, 32-byte scalar "d"
	subject: string; // mailto: or https: contact
}

/** RFC 8292 allows an https: URL as the contact, so the app's own origin is a fine default. */
export function vapidFromEnv(
	env: { VAPID_PUBLIC_KEY: string; VAPID_PRIVATE_KEY: string; VAPID_SUBJECT?: string },
	origin: string
): Vapid {
	return {
		publicKey: env.VAPID_PUBLIC_KEY,
		privateKey: env.VAPID_PRIVATE_KEY,
		subject: env.VAPID_SUBJECT || origin
	};
}

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
	const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
	let o = 0;
	for (const p of parts) {
		out.set(p, o);
		o += p.length;
	}
	return out;
}

async function hmac(
	key: Uint8Array<ArrayBuffer>,
	data: Uint8Array<ArrayBuffer>
): Promise<Uint8Array<ArrayBuffer>> {
	const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, [
		'sign'
	]);
	return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}

/** Encrypt `payload` for one subscription. Returns the full aes128gcm request body. */
export async function encryptPayload(
	payload: Uint8Array<ArrayBuffer>,
	uaPublic: Uint8Array<ArrayBuffer>,
	authSecret: Uint8Array<ArrayBuffer>,
	// Injectable for tests.
	opts: { salt?: Uint8Array<ArrayBuffer>; asKeys?: CryptoKeyPair } = {}
): Promise<Uint8Array<ArrayBuffer>> {
	const asKeys =
		opts.asKeys ??
		((await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
			'deriveBits'
		])) as CryptoKeyPair);
	const asPublic = new Uint8Array(
		(await crypto.subtle.exportKey('raw', asKeys.publicKey)) as ArrayBuffer
	);
	const uaKey = await crypto.subtle.importKey(
		'raw',
		uaPublic,
		{ name: 'ECDH', namedCurve: 'P-256' },
		false,
		[]
	);
	const shared = new Uint8Array(
		// workers-types names this field `$public`; the runtime (and the spec) use `public`.
		await crypto.subtle.deriveBits(
			{ name: 'ECDH', public: uaKey } as unknown as SubtleCryptoDeriveKeyAlgorithm,
			asKeys.privateKey,
			256
		)
	);

	// IKM = HKDF(auth_secret, ecdh_secret, "WebPush: info" || 0x00 || ua_public || as_public, 32)
	const prkKey = await hmac(authSecret, shared);
	const keyInfo = concat(enc.encode('WebPush: info\0'), uaPublic, asPublic, new Uint8Array([1]));
	const ikm = await hmac(prkKey, keyInfo);

	const salt = opts.salt ?? crypto.getRandomValues(new Uint8Array(16));
	const prk = await hmac(salt, ikm);
	const cek = (
		await hmac(prk, concat(enc.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))
	).slice(0, 16);
	const nonce = (
		await hmac(prk, concat(enc.encode('Content-Encoding: nonce\0'), new Uint8Array([1])))
	).slice(0, 12);

	// Single record: payload || 0x02 (last-record delimiter), no padding.
	const plaintext = concat(payload, new Uint8Array([2]));
	const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
	const ciphertext = new Uint8Array(
		await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, plaintext)
	);

	const rs = 4096;
	const header = new Uint8Array(16 + 4 + 1 + asPublic.length);
	header.set(salt, 0);
	new DataView(header.buffer).setUint32(16, rs);
	header[20] = asPublic.length;
	header.set(asPublic, 21);
	return concat(header, ciphertext);
}

const vapidKeyCache = new Map<string, CryptoKey>();

async function vapidSigningKey(v: Vapid): Promise<CryptoKey> {
	const cached = vapidKeyCache.get(v.privateKey);
	if (cached) return cached;
	const pub = b64urlDecode(v.publicKey);
	const key = await crypto.subtle.importKey(
		'jwk',
		{
			kty: 'EC',
			crv: 'P-256',
			d: v.privateKey,
			x: b64urlEncode(pub.slice(1, 33)),
			y: b64urlEncode(pub.slice(33, 65)),
			ext: true
		},
		{ name: 'ECDSA', namedCurve: 'P-256' },
		false,
		['sign']
	);
	vapidKeyCache.set(v.privateKey, key);
	return key;
}

export async function vapidAuthHeader(endpoint: string, v: Vapid): Promise<string> {
	const aud = new URL(endpoint).origin;
	const header = b64urlEncode(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
	const claims = b64urlEncode(
		enc.encode(
			JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: v.subject })
		)
	);
	const unsigned = `${header}.${claims}`;
	// WebCrypto returns the raw r||s signature that JWS ES256 expects.
	const sig = await crypto.subtle.sign(
		{ name: 'ECDSA', hash: 'SHA-256' },
		await vapidSigningKey(v),
		enc.encode(unsigned)
	);
	return `vapid t=${unsigned}.${b64urlEncode(sig)}, k=${v.publicKey}`;
}

export interface PushMessage {
	title: string;
	body: string;
	url: string;
	tag?: string;
	threadIds?: string[];
}

const TOPIC_MAX_LENGTH = 32;

async function pushTopic(tag: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', enc.encode(tag));
	return b64urlEncode(digest).slice(0, TOPIC_MAX_LENGTH);
}

/** Send one push. Returns the push service's HTTP status (404/410 = subscription is gone). */
export async function sendPush(
	sub: PushSubscriptionKeys,
	msg: PushMessage,
	v: Vapid,
	urgency: 'high' | 'normal' | 'low' = 'normal'
): Promise<number> {
	const body = await encryptPayload(
		new Uint8Array(enc.encode(JSON.stringify(msg))),
		b64urlDecode(sub.p256dh),
		b64urlDecode(sub.auth)
	);
	const res = await fetch(sub.endpoint, {
		method: 'POST',
		headers: {
			Authorization: await vapidAuthHeader(sub.endpoint, v),
			'Content-Encoding': 'aes128gcm',
			'Content-Type': 'application/octet-stream',
			TTL: String(24 * 3600),
			Urgency: urgency,
			...(msg.tag ? { Topic: await pushTopic(msg.tag) } : {})
		},
		body
	});
	return res.status;
}
