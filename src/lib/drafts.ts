import { browser } from '$app/environment';

export const DRAFTS_KEY = 'hush:comment-drafts';
const DRAFT_MAX_AGE_MS = 30 * 86_400_000;

type Draft = { text: string; savedAt: number };
type Drafts = Record<string, Draft>;

export const draftKey = (repo: string, number: number) => `${repo}#${number}`;

function readDrafts(): Drafts {
	if (!browser) return {};
	try {
		const parsed: unknown = JSON.parse(localStorage.getItem(DRAFTS_KEY) ?? '{}');
		return parsed && typeof parsed === 'object' ? (parsed as Drafts) : {};
	} catch {
		return {};
	}
}

function writeDrafts(drafts: Drafts) {
	const oldestKept = Date.now() - DRAFT_MAX_AGE_MS;
	const fresh = Object.fromEntries(
		Object.entries(drafts).filter(([, d]) => d.savedAt >= oldestKept && d.text.trim())
	);
	try {
		if (Object.keys(fresh).length) localStorage.setItem(DRAFTS_KEY, JSON.stringify(fresh));
		else localStorage.removeItem(DRAFTS_KEY);
	} catch {
		return;
	}
}

export function loadDraft(key: string): string {
	return readDrafts()[key]?.text ?? '';
}

export function saveDraft(key: string, text: string) {
	if (!browser) return;
	const drafts = readDrafts();
	if (!text.trim() && !drafts[key]) return;
	drafts[key] = { text, savedAt: Date.now() };
	writeDrafts(drafts);
}

export function clearDraft(key: string) {
	saveDraft(key, '');
}
