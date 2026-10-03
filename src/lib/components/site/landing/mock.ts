export interface MockPerson {
	login: string;
	initials: string;
	hue: number;
	avatar?: string;
}

export const PEOPLE = {
	alice: { login: 'alice', initials: 'AL', hue: 150 },
	bo: { login: 'bo', initials: 'BO', hue: 30 },
	mei: { login: 'mei', initials: 'MK', hue: 300 },
	sam: { login: 'sam', initials: 'SR', hue: 200 },
	dependabot: { login: 'dependabot', initials: 'DB', hue: 256 },
	you: { login: 'you', initials: 'YO', hue: 256 }
} satisfies Record<string, MockPerson>;

export type Signal = 'review' | 'fail' | 'merge' | 'reply' | 'warn';

export const signalColor = (signal: Signal) => `var(--signal-${signal})`;
