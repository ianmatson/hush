import { describe, expect, it } from 'vitest';
import { b64urlDecode, b64urlEncode, toHex } from './bytes';

describe('base64url', () => {
	it('encodes without padding and with the URL-safe alphabet', () => {
		expect(b64urlEncode(new Uint8Array([0xfb, 0xff, 0xbf]))).toBe('-_-_');
		expect(b64urlEncode(new Uint8Array([1]))).toBe('AQ');
		expect(b64urlEncode(new Uint8Array([1, 2, 3, 4]).buffer)).toBe('AQIDBA');
	});

	it('decodes what it encodes, padded or not', () => {
		const bytes = crypto.getRandomValues(new Uint8Array(65));
		expect(b64urlDecode(b64urlEncode(bytes))).toEqual(bytes);
		expect([...b64urlDecode('AQ')]).toEqual([1]);
		expect([...b64urlDecode('AQ==')]).toEqual([1]);
	});
});

describe('toHex', () => {
	it('writes two lowercase digits for each byte', () => {
		expect(toHex(new Uint8Array([0, 15, 16, 255]))).toBe('000f10ff');
		expect(toHex(new Uint8Array([171, 205]).buffer)).toBe('abcd');
	});
});
