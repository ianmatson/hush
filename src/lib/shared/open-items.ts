export type OpenItems = 'peek' | 'page';

export const OPEN_ITEMS: { id: OpenItems; label: string; description: string }[] = [
	{ id: 'peek', label: 'Peek', description: 'In a panel next to the list.' },
	{ id: 'page', label: 'Full page', description: 'On a page of its own.' }
];

export const DEFAULT_OPEN_ITEMS: OpenItems = 'peek';

export const knownOpenItems = (value: unknown): OpenItems =>
	OPEN_ITEMS.some((o) => o.id === value) ? (value as OpenItems) : DEFAULT_OPEN_ITEMS;

export function validateOpenItems(v: unknown): string | null {
	return OPEN_ITEMS.some((o) => o.id === v)
		? null
		: `"openItems" must be ${OPEN_ITEMS.map((o) => `"${o.id}"`).join(' or ')}.`;
}
