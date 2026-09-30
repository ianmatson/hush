/**
 * Where a position in a textarea is on screen, relative to the textarea's top-left corner (for a
 * popup at the caret). A hidden copy with the same text and style measures it.
 */
export function caretXY(
	el: HTMLTextAreaElement,
	pos: number
): { x: number; y: number; line: number } {
	const style = getComputedStyle(el);
	const mirror = document.createElement('div');
	for (const p of [
		'boxSizing',
		'width',
		'paddingTop',
		'paddingRight',
		'paddingBottom',
		'paddingLeft',
		'borderTopWidth',
		'borderRightWidth',
		'borderBottomWidth',
		'borderLeftWidth',
		'fontFamily',
		'fontSize',
		'fontWeight',
		'fontStyle',
		'letterSpacing',
		'lineHeight',
		'textTransform',
		'wordSpacing',
		'tabSize'
	] as const)
		mirror.style[p] = style[p];
	Object.assign(mirror.style, {
		position: 'absolute',
		visibility: 'hidden',
		top: '0',
		left: '-9999px',
		whiteSpace: 'pre-wrap',
		overflowWrap: 'break-word'
	});
	mirror.textContent = el.value.slice(0, pos);
	const mark = document.createElement('span');
	mark.textContent = el.value.slice(pos) || '.';
	mirror.appendChild(mark);
	document.body.appendChild(mirror);
	const line = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.4;
	const out = { x: mark.offsetLeft - el.scrollLeft, y: mark.offsetTop - el.scrollTop, line };
	mirror.remove();
	return out;
}
