import type { MarkColor } from './types';

export const PROJECT_SCOPE = 'project';
const READ_PROJECT_SCOPE = 'read:project';

export type ProjectAccess = 'none' | 'read' | 'edit';

export function projectAccessOf(scopes: string[]): ProjectAccess {
	if (scopes.includes(PROJECT_SCOPE)) return 'edit';
	if (scopes.includes(READ_PROJECT_SCOPE)) return 'read';
	return 'none';
}

export const PROJECT_ACCESS_NEEDED =
	'A source reads a project board, but Hush has no project access. Give Hush project access in Settings → General → GitHub access.';

const MISSING_PROJECT_SCOPE = /INSUFFICIENT_SCOPES|required scopes|read:project/i;
export const lacksProjectScope = (message: string) => MISSING_PROJECT_SCOPE.test(message);

const PROJECT_WORD = /(?:^|\s)project:([\w.-]+)\/(\d+)(?=\s|$)/i;
const STATUS_WORD = /(?:^|\s)-?status:\S/i;

export interface BoardQuery {
	owner: string;
	number: number;
	filter: string;
}

export function boardQueryOf(query: string): BoardQuery | null {
	const project = PROJECT_WORD.exec(query);
	if (!project || !STATUS_WORD.test(query)) return null;
	return {
		owner: project[1],
		number: Number(project[2]),
		filter: query.replace(PROJECT_WORD, ' ').replace(/\s+/g, ' ').trim()
	};
}

export const readsBoard = (query: string) => boardQueryOf(query) !== null;

export interface ProjectRef {
	id: string;
	number: number;
	title: string;
	url: string;
}

export interface ProjectStatusOption {
	id: string;
	name: string;
	color: string;
}

export interface ProjectStatus {
	fieldId: string;
	optionId: string | null;
	options: ProjectStatusOption[];
}

export interface ProjectItemDTO {
	id: string;
	project: ProjectRef;
	status: ProjectStatus | null;
}

export interface ProjectsDTO {
	access: ProjectAccess;
	contentId: string | null;
	items: ProjectItemDTO[];
	others: ProjectRef[];
}

const MARK_OF_PROJECT_COLOR: Record<string, MarkColor> = {
	GRAY: 'gray',
	BLUE: 'blue',
	GREEN: 'green',
	YELLOW: 'amber',
	ORANGE: 'orange',
	RED: 'red',
	PINK: 'pink',
	PURPLE: 'violet'
};
export const statusColor = (color: string): MarkColor => MARK_OF_PROJECT_COLOR[color] ?? 'gray';

export const statusOf = (status: ProjectStatus | null) =>
	status?.options.find((o) => o.id === status.optionId) ?? null;

export const statusName = (status: ProjectStatus | null) => statusOf(status)?.name ?? null;

export type ProjectEdit =
	| {
			action: 'status';
			projectId: string;
			itemId: string;
			fieldId: string;
			optionId: string | null;
	  }
	| { action: 'remove'; projectId: string; itemId: string }
	| { action: 'move'; projectId: string; itemId: string; toProjectId: string; contentId: string };
