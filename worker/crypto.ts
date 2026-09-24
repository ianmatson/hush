const enc = new TextEncoder();
const dec = new TextDecoder();

export function b64urlEncode(bytes: ArrayBuffer | Uint8Array): string {
	const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
	let s = '';
	for (const b of u8) s += String.fromCharCode(b);
	return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlDecode(s: string): Uint8Array<ArrayBuffer> {
	const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
	const bin = atob(b64);
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
}

export function randomToken(bytes = 32): string {
	return b64urlEncode(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function sha256(input: string): Promise<string> {
	return b64urlEncode(await crypto.subtle.digest('SHA-256', enc.encode(input)));
}

let cachedKey: { raw: string; key: CryptoKey } | null = null;

async function tokenKey(secret: string): Promise<CryptoKey> {
	if (cachedKey?.raw === secret) return cachedKey.key;
	const key = await crypto.subtle.importKey('raw', b64urlDecode(secret), 'AES-GCM', false, [
		'encrypt',
		'decrypt'
	]);
	cachedKey = { raw: secret, key };
	return key;
}

/** Encrypt a GitHub token at rest with AES-256-GCM. */
export async function encryptSecret(
	plain: string,
	secret: string
): Promise<{ ct: string; iv: string }> {
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const ct = await crypto.subtle.encrypt(
		{ name: 'AES-GCM', iv },
		await tokenKey(secret),
		enc.encode(plain)
	);
	return { ct: b64urlEncode(ct), iv: b64urlEncode(iv) };
}

export async function decryptSecret(ct: string, iv: string, secret: string): Promise<string> {
	const pt = await crypto.subtle.decrypt(
		{ name: 'AES-GCM', iv: b64urlDecode(iv) },
		await tokenKey(secret),
		b64urlDecode(ct)
	);
	return dec.decode(pt);
}
