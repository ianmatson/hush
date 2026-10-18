import type { Component } from 'svelte';
import Bell from '@lucide/svelte/icons/bell';
import LayoutList from '@lucide/svelte/icons/layout-list';
import Settings2 from '@lucide/svelte/icons/settings-2';
import Keyboard from '@lucide/svelte/icons/keyboard';
import Shapes from '@lucide/svelte/icons/shapes';
import type { SettingsPage } from '$lib/shared/settings-schema';

export const SETTINGS_ICONS: Record<SettingsPage, Component> = {
	general: Settings2,
	views: LayoutList,
	categories: Shapes,
	notifications: Bell,
	keys: Keyboard
};
