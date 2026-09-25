import { setTheme as mwSetTheme, theme as mwTheme } from 'mode-watcher';
import { THEMES, type ThemeSwatch } from '$lib/themes/list';

/**
 * Color themes (shadcn themes from tweakcn, see scripts/build-themes.mjs). A theme is independent
 * of light and dark mode: each one has both. mode-watcher saves it per browser, like the mode;
 * app.html applies it before the first paint, so the page does not flash in the default colors.
 */
export const DEFAULT_THEME = 'default';

const DEFAULT: { id: string; label: string; light: ThemeSwatch; dark: ThemeSwatch } = {
	id: DEFAULT_THEME,
	label: 'Hush',
	light: {
		bg: 'oklch(1 0 0)',
		fg: 'oklch(0.145 0 0)',
		primary: 'oklch(0.205 0 0)',
		accent: 'oklch(0.97 0 0)',
		muted: 'oklch(0.97 0 0)'
	},
	dark: {
		bg: 'oklch(0.145 0 0)',
		fg: 'oklch(0.985 0 0)',
		primary: 'oklch(0.922 0 0)',
		accent: 'oklch(0.269 0 0)',
		muted: 'oklch(0.269 0 0)'
	}
};

export const ALL_THEMES = [DEFAULT, ...THEMES];

/** The current theme id. mode-watcher stores it and sets `data-theme` on <html>. */
export const theme = {
	get current() {
		return mwTheme.current || DEFAULT_THEME;
	}
};

export function setTheme(id: string) {
	if (!ALL_THEMES.some((t) => t.id === id)) id = DEFAULT_THEME;
	// An empty theme means the default colors (no data-theme match).
	mwSetTheme(id === DEFAULT_THEME ? '' : id);
}
