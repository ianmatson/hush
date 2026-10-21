export const MCP_SCOPE = 'saved-views:read' as const;

export interface McpView {
	id: string;
	name: string;
}

export interface McpConsentDTO {
	requestId: string;
	csrfToken: string;
	client: { id: string; name: string; redirectUri: string };
	scope: typeof MCP_SCOPE;
	views: (McpView & { searches: string[] })[];
	expiresAt: number;
}

export interface McpGrant {
	id: string;
	clientId: string;
	clientName: string;
	createdAt: number;
	expiresAt: number;
	scope: typeof MCP_SCOPE;
	views: McpView[];
	status: 'active' | 'expired';
}

export interface McpGrantsDTO {
	resource: string;
	grants: McpGrant[];
	csrfToken: string;
}

export interface McpConsentDecision {
	requestId: string;
	csrfToken: string;
	viewIds: string[];
	decision: 'allow' | 'deny';
}
