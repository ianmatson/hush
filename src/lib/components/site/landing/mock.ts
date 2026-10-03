export interface MockPerson {
	login: string;
	initials: string;
	hue: number;
	avatar?: string;
}

export type Signal = 'review' | 'fail' | 'merge' | 'reply' | 'warn';

export const signalColor = (signal: Signal) => `var(--signal-${signal})`;
