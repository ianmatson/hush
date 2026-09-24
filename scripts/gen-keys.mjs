// Prints fresh secrets for .dev.vars or `wrangler secret put`.
const b64url = (buf) => Buffer.from(buf).toString('base64url');

const tokenKey = crypto.getRandomValues(new Uint8Array(32));
const vapid = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
const pub = await crypto.subtle.exportKey('raw', vapid.publicKey);
const { d } = await crypto.subtle.exportKey('jwk', vapid.privateKey);

console.log(`TOKEN_ENC_KEY=${b64url(tokenKey)}`);
console.log(`VAPID_PUBLIC_KEY=${b64url(pub)}`);
console.log(`VAPID_PRIVATE_KEY=${d}`);
