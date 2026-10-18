export const EVERYTHING_ELSE_SECTION = 'Everything else';

export const ROLE_SECTIONS = [
	{ key: 'opened', label: 'You opened' },
	{ key: 'reviews', label: 'Reviews' },
	{ key: 'assigned', label: 'Assigned to you' },
	{ key: 'involved', label: 'Involved' }
] as const;
export type RoleSection = (typeof ROLE_SECTIONS)[number]['key'];

export const STATUS_SECTIONS = [
	{ key: 'no-review', label: 'No review yet' },
	{ key: 'in-review', label: 'In review' },
	{ key: 'changes', label: 'Changes requested' },
	{ key: 'approved', label: 'Approved' },
	{ key: 'drafts', label: 'Drafts' },
	{ key: 'unassigned', label: 'Unassigned' },
	{ key: 'assigned', label: 'Assigned' }
] as const;
export type StatusSection = (typeof STATUS_SECTIONS)[number]['key'];
