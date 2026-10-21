import { DurableObject } from 'cloudflare:workers';
import {
	AuthorizationError,
	OAuthAuthorizationServer,
	OAuthError,
	type TokenExchangeCallbackOptions,
	type TokenExchangeCallbackResult
} from '@cloudflare/workers-oauth-provider';
import {
	MCP_SCOPE,
	type McpConsentDecision,
	type McpConsentDTO,
	type McpGrant
} from '../../src/lib/shared/mcp';
import { randomToken } from '../crypto';
import type { Env } from '../db';
import { fingerprintView, type SavedViewGrant } from './grant';
import type { SavedViewsSnapshot, SnapshotPrincipal } from './snapshot';
import { oauthStorage, type OAuthRecord } from './oauth-storage';

const GRANT_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const CONSENT_LIFETIME_MS = 10 * 60 * 1000;
const MAX_CLIENTS = 1000;
const MAX_PENDING_CONSENTS = 100;
const MAX_USER_GRANTS = 20;
const CLEANUP_BATCH = 100;

const invalidConsent = () => ({
	error: 'This request expired or is invalid. Restart the connection.'
});

export const mcpResource = (env: Pick<Env, 'APP_URL'>) => `${new URL(env.APP_URL).origin}/mcp`;

export function authorizationServer(
	env: Pick<Env, 'APP_URL'>,
	tokenExchangeCallback?: (
		options: TokenExchangeCallbackOptions
	) => Promise<TokenExchangeCallbackResult | void>
) {
	const issuer = new URL(env.APP_URL).origin;
	return new OAuthAuthorizationServer({
		issuer,
		resources: [mcpResource(env)],
		authorizeEndpoint: '/oauth/authorize',
		tokenEndpoint: '/oauth/token',
		clientRegistrationEndpoint: '/oauth/register',
		clientIdMetadataDocumentEnabled: false,
		allowTokenExchangeGrant: false,
		accessTokenTTL: 15 * 60,
		refreshTokenTTL: 30 * 24 * 60 * 60,
		clientRegistrationTTL: 30 * 24 * 60 * 60,
		scopesSupported: [MCP_SCOPE],
		tokenExchangeCallback,
		clientRegistrationCallback: async (options) => {
			if (options.clientMetadata.token_endpoint_auth_method !== 'none')
				return {
					code: 'invalid_client_metadata',
					description: 'Only public clients with S256 PKCE are supported.'
				};
		}
	});
}

interface ConsentRecord {
	userId: number;
	session: string;
	csrfToken: string;
	clientId: string;
	clientName: string;
	redirectUri: string;
	expiresAt: number;
	accessVersion: string;
	views: { id: string; name: string; searches: string[]; fingerprint: string }[];
}

export interface AccessGrant extends SavedViewGrant {
	protocolGrantId: string;
	clientId: string;
	clientName: string;
	createdAt: number;
	expiresAt: number;
	accessVersion: string;
	views: { id: string; name: string; fingerprint: string }[];
}

export interface BrowserPrincipal extends SnapshotPrincipal {
	session: string;
}

export class McpAuthorization extends DurableObject<Env> {
	#tail: Promise<unknown> = Promise.resolve();

	#serial<T>(operation: () => Promise<T>): Promise<T> {
		const next = this.#tail.then(operation);
		this.#tail = next.catch(() => undefined);
		return next;
	}

	#oauth(readOnly = false) {
		return { OAUTH_KV: oauthStorage(this.ctx.storage, readOnly) };
	}

	#server() {
		return authorizationServer(this.env, async (options) => {
			const props = options.props as { userId?: number; accessGrantId?: string } | undefined;
			const grant =
				props &&
				(await this.ctx.storage.get<AccessGrant>(`access:${props.userId}:${props.accessGrantId}`));
			if (
				!grant ||
				grant.expiresAt <= Date.now() ||
				String(grant.userId) !== options.userId ||
				grant.clientId !== options.clientId
			)
				throw new OAuthError('invalid_grant', { description: 'Access is no longer authorized' });
			const user = await this.env.DB.prepare('SELECT id, login FROM users WHERE id = ?')
				.bind(grant.userId)
				.first<{ id: number; login: string }>();
			if (
				!user ||
				(await this.#snapshot({ userId: user.id, login: user.login })).accessVersion !==
					grant.accessVersion
			)
				throw new OAuthError('invalid_grant', { description: 'Access is no longer authorized' });
		});
	}

	async #cleanup() {
		const cursor = await this.ctx.storage.get<string>('maintenance:cursor');
		const records = await this.ctx.storage.list<OAuthRecord | ConsentRecord | AccessGrant>({
			limit: CLEANUP_BATCH,
			...(cursor ? { startAfter: cursor } : {})
		});
		for (const [key, record] of records) {
			if (key.startsWith('maintenance:')) continue;
			if (key.startsWith('revocation:')) {
				const grant = record as AccessGrant;
				await this.#server()
					.getOAuthApi(this.#oauth())
					.revokeGrant(grant.protocolGrantId, String(grant.userId));
				await this.ctx.storage.delete(key);
				continue;
			}
			const expiresAt =
				'expiresAt' in record
					? record.expiresAt
					: 'expiration' in record
						? (record.expiration ?? Infinity) * 1000
						: Infinity;
			if (expiresAt <= Date.now()) await this.ctx.storage.delete(key);
		}
		await this.ctx.storage.put(
			'maintenance:cursor',
			records.size === CLEANUP_BATCH ? [...records.keys()].at(-1)! : ''
		);
	}

	#snapshot(principal: SnapshotPrincipal): Promise<SavedViewsSnapshot> {
		return this.env.POLLER.get(
			this.env.POLLER.idFromName(String(principal.userId))
		).savedViewsSnapshot({ userId: principal.userId, login: principal.login });
	}

	protocol(request: Request): Promise<Response> {
		return this.#serial(async () => {
			const url = new URL(request.url);
			if (request.method === 'POST') await this.#cleanup();
			if (url.pathname === '/oauth/register' && request.method === 'POST') {
				const clients = await this.ctx.storage.list({
					prefix: 'oauth:client:',
					limit: MAX_CLIENTS
				});
				if (clients.size >= MAX_CLIENTS)
					return Response.json({ error: 'temporarily_unavailable' }, { status: 503 });
			}
			if (url.pathname === '/oauth/token' && request.method === 'POST') {
				const body = new URLSearchParams(await request.clone().text());
				if (
					!body.has('token') &&
					(body.getAll('resource').length !== 1 || body.get('resource') !== mcpResource(this.env))
				)
					return Response.json({ error: 'invalid_target' }, { status: 400 });
				if (
					body.get('grant_type') === 'authorization_code' &&
					(!body.get('redirect_uri') ||
						!/^[A-Za-z0-9._~-]{43,128}$/.test(body.get('code_verifier') ?? ''))
				)
					return Response.json({ error: 'invalid_request' }, { status: 400 });
			}
			return this.#server().fetch(request, this.#oauth(), this.ctx as unknown as ExecutionContext);
		});
	}

	begin(request: Request, principal: BrowserPrincipal): Promise<Response> {
		return this.#serial(async () => {
			await this.#cleanup();
			const pending = await this.ctx.storage.list({
				prefix: 'consent:',
				limit: MAX_PENDING_CONSENTS
			});
			if (pending.size >= MAX_PENDING_CONSENTS)
				return Response.json(
					{ error: 'Too many pending connections. Try again later.' },
					{ status: 429 }
				);
			const api = this.#server().getOAuthApi(this.#oauth());
			try {
				const url = new URL(request.url);
				if (
					url.searchParams.getAll('resource').length !== 1 ||
					url.searchParams.get('resource') !== mcpResource(this.env)
				)
					throw new AuthorizationError('invalid_target', { description: 'Invalid resource' });
				const auth = await api.parseAuthRequest(request);
				if (
					auth.scope.length !== 1 ||
					auth.scope[0] !== MCP_SCOPE ||
					auth.codeChallengeMethod !== 'S256' ||
					!/^[A-Za-z0-9_-]{43}$/.test(auth.codeChallenge ?? '')
				)
					throw new AuthorizationError('invalid_request', { description: 'Invalid scope or PKCE' });
				const client = await api.lookupClient(auth.clientId);
				const snapshot = await this.#snapshot(principal);
				const consent = await api.beginConsent(auth);
				const record: ConsentRecord = {
					userId: principal.userId,
					session: principal.session,
					csrfToken: randomToken(),
					clientId: auth.clientId,
					clientName: client?.clientName ?? 'Unnamed app',
					redirectUri: auth.redirectUri,
					expiresAt: Date.now() + CONSENT_LIFETIME_MS,
					accessVersion: snapshot.accessVersion,
					views: await Promise.all(
						snapshot.views.map(async (view) => ({
							id: view.id,
							name: view.name,
							searches: view.searches,
							fingerprint: await fingerprintView(view)
						}))
					)
				};
				await this.ctx.storage.put(`consent:${consent.handle}`, record);
				consent.headers.set(
					'Location',
					`${new URL(this.env.APP_URL).origin}/oauth/consent?request=${encodeURIComponent(consent.handle)}`
				);
				return new Response(null, { status: 302, headers: consent.headers });
			} catch (error) {
				if (error instanceof AuthorizationError)
					return Response.json(
						{ error: 'Invalid authorization request. Restart the connection.' },
						{ status: 400 }
					);
				throw error;
			}
		});
	}

	async #consent(id: string, principal: BrowserPrincipal) {
		if (typeof id !== 'string' || id.length > 128)
			throw new AuthorizationError('invalid_request', { description: 'Invalid consent' });
		const record = await this.ctx.storage.get<ConsentRecord>(`consent:${id}`);
		if (
			!record ||
			record.expiresAt <= Date.now() ||
			record.userId !== principal.userId ||
			record.session !== principal.session
		)
			throw new AuthorizationError('invalid_request', { description: 'Invalid consent' });
		return record;
	}

	consent(id: string, principal: BrowserPrincipal): Promise<McpConsentDTO | { error: string }> {
		return this.#serial(async () => {
			const record = await this.#consent(id, principal);
			return {
				requestId: id,
				csrfToken: record.csrfToken,
				client: { id: record.clientId, name: record.clientName, redirectUri: record.redirectUri },
				scope: MCP_SCOPE,
				views: record.views.map(({ id, name, searches }) => ({ id, name, searches })),
				expiresAt: record.expiresAt
			};
		}).catch((error: unknown) => {
			if (error instanceof AuthorizationError) return invalidConsent();
			throw error;
		});
	}

	decide(
		request: Request,
		principal: BrowserPrincipal,
		decision: McpConsentDecision
	): Promise<Response> {
		return this.#serial(async () => {
			await this.#cleanup();
			const record = await this.#consent(decision.requestId, principal);
			if (record.csrfToken !== decision.csrfToken)
				throw new AuthorizationError('invalid_request', { description: 'Invalid consent' });
			const api = this.#server().getOAuthApi(this.#oauth());
			if (decision.decision === 'deny') {
				const denied = await api.denyConsent(request, decision.requestId);
				await this.ctx.storage.delete(`consent:${decision.requestId}`);
				return Response.json({ redirectTo: denied.redirectTo }, { headers: denied.headers });
			}
			if (
				decision.decision !== 'allow' ||
				!Array.isArray(decision.viewIds) ||
				!decision.viewIds.length ||
				new Set(decision.viewIds).size !== decision.viewIds.length ||
				decision.viewIds.some((id) => !record.views.some((view) => view.id === id))
			)
				throw new AuthorizationError('invalid_request', { description: 'Invalid views' });
			const existing = await this.ctx.storage.list({
				prefix: `access:${principal.userId}:`,
				limit: MAX_USER_GRANTS
			});
			if (existing.size >= MAX_USER_GRANTS)
				return Response.json(
					{ error: 'Revoke an existing app before you connect another.' },
					{ status: 400 }
				);
			const snapshot = await this.#snapshot(principal);
			if (snapshot.accessVersion !== record.accessVersion)
				throw new AuthorizationError('invalid_request', { description: 'Settings changed' });
			const views = record.views.filter((view) => decision.viewIds.includes(view.id));
			for (const view of views) {
				const current = snapshot.views.find((entry) => entry.id === view.id);
				if (!current || (await fingerprintView(current)) !== view.fingerprint)
					throw new AuthorizationError('invalid_request', { description: 'View changed' });
			}
			const approved = await api.approveConsent(request, decision.requestId, {
				scope: [MCP_SCOPE]
			});
			await this.ctx.storage.delete(`consent:${decision.requestId}`);
			const grant: AccessGrant = {
				protocolGrantId: '',
				id: randomToken(),
				userId: principal.userId,
				clientId: record.clientId,
				clientName: record.clientName,
				createdAt: Date.now(),
				expiresAt: Date.now() + GRANT_LIFETIME_MS,
				accessVersion: record.accessVersion,
				views: views.map(({ id, name, fingerprint }) => ({ id, name, fingerprint }))
			};
			const completed = await api.completeAuthorization({
				request: approved.request,
				userId: String(principal.userId),
				metadata: { accessGrantId: grant.id },
				scope: [MCP_SCOPE],
				props: { userId: principal.userId, accessGrantId: grant.id },
				revokeExistingGrants: false
			});
			const issued = await api.listUserGrants(String(principal.userId), { limit: 100 });
			const protocolGrant = issued.items.find(
				(entry) => entry.metadata?.accessGrantId === grant.id && entry.clientId === grant.clientId
			);
			if (!protocolGrant) throw new Error('Issued OAuth grant is unavailable');
			grant.protocolGrantId = protocolGrant.id;
			await this.ctx.storage.put(`access:${principal.userId}:${grant.id}`, grant);
			return Response.json(completed, { headers: approved.headers });
		}).catch((error: unknown) => {
			if (error instanceof AuthorizationError)
				return Response.json(invalidConsent(), { status: 400 });
			throw error;
		});
	}

	grants(principal: SnapshotPrincipal): Promise<McpGrant[]> {
		return this.#serial(async () => {
			const accessVersion = await this.#snapshot(principal).then(
				(snapshot) => snapshot.accessVersion,
				() => null
			);
			const grants = await this.ctx.storage.list<AccessGrant>({
				prefix: `access:${principal.userId}:`
			});
			return Promise.all(
				[...grants.values()].map(async (grant) => ({
					id: grant.id,
					clientId: grant.clientId,
					clientName: grant.clientName,
					createdAt: grant.createdAt,
					expiresAt: grant.expiresAt,
					scope: MCP_SCOPE,
					views: grant.views.map(({ id, name }) => ({ id, name })),
					status:
						grant.expiresAt > Date.now() &&
						grant.accessVersion === accessVersion &&
						(await this.#oauth(true).OAUTH_KV.get(
							`grant:${principal.userId}:${grant.protocolGrantId}`
						))
							? ('active' as const)
							: ('expired' as const)
				}))
			);
		});
	}

	revoke(userId: number, id: string): Promise<void> {
		return this.#serial(async () => {
			await this.#cleanup();
			const grant =
				(await this.ctx.storage.get<AccessGrant>(`access:${userId}:${id}`)) ??
				(await this.ctx.storage.get<AccessGrant>(`revocation:${userId}:${id}`));
			if (grant) await this.ctx.storage.put(`revocation:${userId}:${id}`, grant);
			await this.ctx.storage.delete(`access:${userId}:${id}`);
			if (grant) {
				await this.#server()
					.getOAuthApi(this.#oauth())
					.revokeGrant(grant.protocolGrantId, String(userId));
				await this.ctx.storage.delete(`revocation:${userId}:${id}`);
			}
		});
	}

	revokeAll(userId: number): Promise<void> {
		return this.#serial(async () => {
			await this.#cleanup();
			const grants = await this.ctx.storage.list<AccessGrant>({ prefix: `access:${userId}:` });
			for (const [key, grant] of grants) {
				await this.ctx.storage.put(`revocation:${userId}:${grant.id}`, grant);
				await this.ctx.storage.delete(key);
			}
			for (const grant of grants.values()) {
				await this.#server()
					.getOAuthApi(this.#oauth())
					.revokeGrant(grant.protocolGrantId, String(userId));
				await this.ctx.storage.delete(`revocation:${userId}:${grant.id}`);
			}
		});
	}

	validate(token: string): Promise<AccessGrant | null> {
		return this.#serial(async () => {
			const summary = await this.#server().getOAuthApi(this.#oauth(true)).unwrapToken(token);
			if (!summary || summary.audience !== mcpResource(this.env)) return null;
			const validated = await this.#server().validateToken<{
				userId: number;
				accessGrantId: string;
			}>(mcpResource(this.env), token, this.#oauth(true));
			if (
				!validated ||
				validated.expiresAt <= Date.now() / 1000 ||
				!validated.scope.includes(MCP_SCOPE) ||
				!Number.isSafeInteger(validated.props?.userId) ||
				validated.userId !== String(validated.props.userId)
			)
				return null;
			const grant = await this.ctx.storage.get<AccessGrant>(
				`access:${validated.props.userId}:${validated.props.accessGrantId}`
			);
			if (
				!grant ||
				grant.userId !== validated.props.userId ||
				grant.expiresAt <= Date.now() ||
				grant.clientId !== validated.clientId
			)
				return null;
			const parts = token.split(':');
			const protocolGrant = await this.#oauth(true).OAUTH_KV.get(
				`grant:${parts[0]}:${parts[1]}`,
				'json'
			);
			if (
				!protocolGrant ||
				protocolGrant.resource !== mcpResource(this.env) ||
				protocolGrant.id !== grant.protocolGrantId ||
				protocolGrant.expiresAt <= Date.now() / 1000
			)
				return null;
			return grant;
		});
	}
}
