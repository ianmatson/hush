import { createECDH } from 'node:crypto';
import { describe, expect, it } from 'vitest';
// @ts-expect-error no types
import ece from 'http_ece';
import { b64urlDecode, b64urlEncode, decryptSecret, encryptSecret, randomToken } from '../crypto';
import { encryptPayload, vapidAuthHeader } from '../webpush';

describe('encryptPayload (RFC 8291)', () => {
	it('produces a body that an independent aes128gcm implementation decrypts', async () => {
		// The "user agent" (browser) side of a push subscription.
		const ua = createECDH('prime256v1');
		ua.generateKeys();
		const authSecret = crypto.getRandomValues(new Uint8Array(16));
		const message = JSON.stringify({
			title: 'CI failed on your PR',
			url: 'https://github.com/a/b/pull/1'
		});

		const body = await encryptPayload(
			new Uint8Array(new TextEncoder().encode(message)),
			new Uint8Array(ua.getPublicKey()),
			authSecret
		);

		const plain = ece.decrypt(Buffer.from(body), {
			version: 'aes128gcm',
			privateKey: ua,
			authSecret: b64urlEncode(authSecret)
		});
		expect(plain.toString('utf8')).toBe(message);
	});
});

describe('vapidAuthHeader (RFC 8292)', () => {
	it('signs an ES256 JWT that verifies with the public key', async () => {
		const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
			'sign',
			'verify'
		]);
		const publicKey = b64urlEncode(await crypto.subtle.exportKey('raw', pair.publicKey));
		const { d } = await crypto.subtle.exportKey('jwk', pair.privateKey);

		const header = await vapidAuthHeader('https://fcm.googleapis.com/fcm/send/abc', {
			publicKey,
			privateKey: d!,
			subject: 'mailto:test@example.com'
		});
		const m = header.match(/^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/)!;
		expect(m[4]).toBe(publicKey);
		const claims = JSON.parse(new TextDecoder().decode(b64urlDecode(m[2])));
		expect(claims.aud).toBe('https://fcm.googleapis.com');
		expect(claims.sub).toBe('mailto:test@example.com');
		const ok = await crypto.subtle.verify(
			{ name: 'ECDSA', hash: 'SHA-256' },
			pair.publicKey,
			b64urlDecode(m[3]),
			new TextEncoder().encode(`${m[1]}.${m[2]}`)
		);
		expect(ok).toBe(true);
	});
});

describe('token encryption', () => {
	it('round-trips', async () => {
		const key = randomToken(32);
		const { ct, iv } = await encryptSecret('ghp_example', key);
		expect(ct).not.toContain('ghp_');
		expect(await decryptSecret(ct, iv, key)).toBe('ghp_example');
	});
});
