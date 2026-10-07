export type ExternalContributor = 'first-time' | 'external';

const FIRST_TIME_ASSOCIATIONS = new Set(['FIRST_TIME_CONTRIBUTOR', 'FIRST_TIMER']);
const EXTERNAL_ASSOCIATIONS = new Set([...FIRST_TIME_ASSOCIATIONS, 'CONTRIBUTOR', 'NONE']);

export function externalContributor(
	association: string | null | undefined,
	authorIsBot: boolean
): ExternalContributor | null {
	if (authorIsBot || !association || !EXTERNAL_ASSOCIATIONS.has(association)) return null;
	return FIRST_TIME_ASSOCIATIONS.has(association) ? 'first-time' : 'external';
}

export const EXTERNAL_CONTRIBUTOR_TEXT: Record<
	ExternalContributor,
	{ label: string; description: string }
> = {
	external: {
		label: 'External',
		description: 'External contributor: not a member or collaborator of this repository'
	},
	'first-time': {
		label: 'First-time',
		description: 'First-time contributor: their first pull request or issue in this repository'
	}
};
