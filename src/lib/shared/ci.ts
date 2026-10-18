import type { CiState, CiWord } from './types';

const CI_WORD: Record<CiState, CiWord> = {
	SUCCESS: 'success',
	FAILURE: 'failure',
	ERROR: 'failure',
	PENDING: 'pending',
	EXPECTED: 'pending'
};

export const ciWord = (state: CiState | null | undefined): CiWord | null =>
	state ? (CI_WORD[state] ?? null) : null;

export const ciPassing = (state: CiState | null | undefined) => ciWord(state) === 'success';

export const ciFailing = (state: CiState | null | undefined) => ciWord(state) === 'failure';

export const ciRunning = (state: CiState | null | undefined) => ciWord(state) === 'pending';

export const ciFinished = (state: CiState | null | undefined) =>
	ciPassing(state) || ciFailing(state);
