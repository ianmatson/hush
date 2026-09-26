import { defineConfig } from 'vitest/config';
import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import type { ProxyOptions } from 'vite';

const WORKER = 'http://localhost:8787';
// The Worker rejects writes whose Origin is not its own, so the proxy sends its address.
const toWorker: ProxyOptions = { target: WORKER, changeOrigin: true, headers: { origin: WORKER } };

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter({ fallback: 'app.html' }),
			// Absolute asset URLs: the 404 page and the app shell are served at many paths.
			paths: { relative: false }
		})
	],
	server: {
		// `pnpm dev` runs the Worker on :8787 (wrangler dev) next to Vite.
		proxy: { '/api': toWorker, '/feeds': toWorker }
	},
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}', 'worker/**/*.{test,spec}.ts'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
