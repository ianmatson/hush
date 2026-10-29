import { flip, type AnimationConfig, type FlipParams } from 'svelte/animate';

type Moved = { from: DOMRect; to: DOMRect };
type PlaceInGroup = { group: Element; x: number; y: number };

const ROWS_OF_GROUP = ':scope > ul > li';
const placesInGroup = new WeakMap<Element, PlaceInGroup>();

const rectAt = (left: number, top: number, size: DOMRect) =>
	({ left, top, width: size.width, height: size.height }) as DOMRect;

export function recordPlacesInGroups(groups: Iterable<Element>) {
	for (const group of groups) {
		const groupRect = group.getBoundingClientRect();
		for (const row of group.querySelectorAll(ROWS_OF_GROUP)) {
			const rowRect = row.getBoundingClientRect();
			placesInGroup.set(row, {
				group,
				x: rowRect.left - groupRect.left,
				y: rowRect.top - groupRect.top
			});
		}
	}
}

export function flipGroup(
	node: Element,
	{ from, to }: Moved,
	params?: FlipParams
): AnimationConfig {
	return flip(node, { from: rectAt(from.left, from.top, to), to }, params);
}

export function flipInGroup(
	node: Element,
	{ from, to }: Moved,
	params?: FlipParams
): AnimationConfig {
	const place = placesInGroup.get(node);
	if (!place || !place.group.contains(node)) return flip(node, { from, to }, params);
	const groupNow = place.group.getBoundingClientRect();
	const fromInGroup = rectAt(groupNow.left + place.x, groupNow.top + place.y, from);
	return flip(node, { from: fromInGroup, to }, params);
}
