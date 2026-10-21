import { MAX_PAGE_SIZE, type SavedViewTools } from './tools';

const pageProperties = {
	limit: { type: 'integer', minimum: 1, maximum: MAX_PAGE_SIZE, default: 50 },
	cursor: { type: 'string', maxLength: 1024 }
};
const annotations = {
	readOnlyHint: true,
	destructiveHint: false,
	idempotentHint: true,
	openWorldHint: false
};

export const SAVED_VIEW_TOOL_DEFINITIONS = [
	{
		name: 'list_views',
		description: 'List saved Hush views in their saved order. Reads only cached data.',
		inputSchema: { type: 'object', properties: pageProperties, additionalProperties: false },
		annotations
	},
	{
		name: 'get_view',
		description:
			'Read a saved Hush view with its saved grouping and sorting. Hides snoozed and muted items. Reports cache freshness without refreshing or marking items read. Pagination follows grouped rows; restart when snapshot_changed is returned.',
		inputSchema: {
			type: 'object',
			properties: {
				...pageProperties,
				view_id: { type: 'string', pattern: '^[a-z0-9-]{1,40}$' },
				kind: { type: 'string', enum: ['both', 'pr', 'issue'], default: 'both' }
			},
			required: ['view_id'],
			additionalProperties: false
		},
		annotations
	}
] as const;

export function createSavedViewAdapter(tools: SavedViewTools) {
	return async (name: string, input: unknown = {}) => {
		if (name !== 'list_views' && name !== 'get_view')
			return toolResponse({ ok: false, error: { code: 'unknown_tool' } });
		if (!input || typeof input !== 'object' || Array.isArray(input))
			return toolResponse({ ok: false, error: { code: 'invalid_arguments' } });
		const args = input as Record<string, unknown>;
		const allowed =
			name === 'list_views' ? ['limit', 'cursor'] : ['limit', 'cursor', 'view_id', 'kind'];
		if (
			Object.keys(args).some((key) => !allowed.includes(key)) ||
			(args.limit !== undefined && typeof args.limit !== 'number') ||
			(args.cursor !== undefined && typeof args.cursor !== 'string') ||
			(name === 'get_view' && typeof args.view_id !== 'string') ||
			(args.kind !== undefined && !['both', 'pr', 'issue'].includes(args.kind as string))
		)
			return toolResponse({ ok: false, error: { code: 'invalid_arguments' } });
		return toolResponse(
			name === 'list_views'
				? await tools.list_views(args)
				: await tools.get_view(args as unknown as Parameters<SavedViewTools['get_view']>[0])
		);
	};
}

function toolResponse<T extends { ok: boolean }>(result: T) {
	return {
		isError: !result.ok,
		content: [{ type: 'text' as const, text: JSON.stringify(result) }],
		structuredContent: result
	};
}
