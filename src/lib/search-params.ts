import { replaceState } from '$app/navigation';
import { page } from '$app/state';

const afterRouterStarts = (run: () => void) => setTimeout(run);

function dropSearchParams(names: readonly string[]) {
	const url = new URL(location.href);
	for (const name of names) url.searchParams.delete(name);
	replaceState(url, page.state);
}

export function takeSearchParams<const Name extends string>(
	...names: Name[]
): Record<Name, string | null> {
	const url = new URL(location.href);
	if (names.some((name) => url.searchParams.has(name)))
		afterRouterStarts(() => dropSearchParams(names));
	return Object.fromEntries(names.map((name) => [name, url.searchParams.get(name)])) as Record<
		Name,
		string | null
	>;
}
