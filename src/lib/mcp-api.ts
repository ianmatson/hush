import { ApiError } from '$lib/api';
import type { McpConsentDecision, McpConsentDTO, McpGrantsDTO } from '$lib/shared/mcp';

async function request<T>(path: string, body?: unknown): Promise<T> {
	const response = await fetch(path, {
		method: body === undefined ? 'GET' : 'POST',
		credentials: 'same-origin',
		cache: 'no-store',
		headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
		body: body === undefined ? undefined : JSON.stringify(body)
	});
	const data = await response.json().catch(() => ({}));
	if (!response.ok)
		throw new ApiError(response.status, data.error ?? `Request failed (${response.status})`);
	return data as T;
}

export const mcpApi = {
	consent: (requestId: string) =>
		request<McpConsentDTO>(`/api/mcp/consent?request=${encodeURIComponent(requestId)}`),
	decide: (decision: McpConsentDecision) =>
		request<{ redirectTo: string }>('/api/mcp/consent', decision),
	grants: () => request<McpGrantsDTO>('/api/mcp/grants'),
	revoke: (id: string, csrfToken: string) =>
		request<{ ok: true }>(`/api/mcp/grants/${encodeURIComponent(id)}/revoke`, { csrfToken })
};
