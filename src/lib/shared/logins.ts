export const sameLogin = (a: string | null | undefined, b: string | null | undefined): boolean =>
	!!a && !!b && a.toLowerCase() === b.toLowerCase();

export interface ReviewRequest {
	team: boolean;
	name: string;
}

export const requestedByName = (requests: readonly ReviewRequest[], login: string): boolean =>
	requests.some((r) => !r.team && sameLogin(r.name, login));
