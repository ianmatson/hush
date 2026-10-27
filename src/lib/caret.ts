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

export interface MenuSpot {
	x: number;
	y: number;
	above: boolean;
	scale: number;
}

export interface ScreenArea {
	left: number;
	top: number;
	width: number;
	height: number;
	zoom: number;
	fixedOrigin: { x: number; y: number };
}

const SUGGEST_MENU = { width: 288, height: 340 };
const EDGE_MARGIN_PX = 8;
const CARET_GAP_PX = 4;

export function menuSpot(
	caret: { x: number; y: number; line: number },
	visible: ScreenArea,
	menu: { width: number; height: number }
): MenuSpot {
	const scale = 1 / visible.zoom;
	const margin = EDGE_MARGIN_PX * scale;
	const gap = CARET_GAP_PX * scale;
	const right = visible.left + visible.width - menu.width * scale - margin;
	const caretX = caret.x - visible.fixedOrigin.x;
	const caretTop = caret.y - visible.fixedOrigin.y;
	const x = Math.max(visible.left + margin, Math.min(caretX, right));
	const caretBottom = caretTop + caret.line;
	const roomBelow = visible.top + visible.height - caretBottom;
	const roomAbove = caretTop - visible.top;
	return roomBelow > menu.height * scale || roomBelow >= roomAbove
		? { x, y: caretBottom + gap, above: false, scale }
		: { x, y: caretTop - gap, above: true, scale };
}

function fixedOriginOnScreen(): { x: number; y: number } {
	const probe = document.createElement('div');
	Object.assign(probe.style, { position: 'fixed', left: '0', top: '0', visibility: 'hidden' });
	document.body.appendChild(probe);
	const r = probe.getBoundingClientRect();
	probe.remove();
	return { x: r.left, y: r.top };
}

function visibleArea(): ScreenArea {
	const fixedOrigin = fixedOriginOnScreen();
	const v = window.visualViewport;
	if (!v)
		return {
			left: 0,
			top: 0,
			width: window.innerWidth,
			height: window.innerHeight,
			zoom: 1,
			fixedOrigin
		};
	return {
		left: v.offsetLeft,
		top: v.offsetTop,
		width: v.width,
		height: v.height,
		zoom: v.scale,
		fixedOrigin
	};
}

export function onViewportChange(follow: () => void): () => void {
	const viewport = window.visualViewport;
	document.addEventListener('scroll', follow, true);
	window.addEventListener('resize', follow);
	viewport?.addEventListener('scroll', follow);
	viewport?.addEventListener('resize', follow);
	return () => {
		document.removeEventListener('scroll', follow, true);
		window.removeEventListener('resize', follow);
		viewport?.removeEventListener('scroll', follow);
		viewport?.removeEventListener('resize', follow);
	};
}

export function suggestMenuSpot(el: HTMLTextAreaElement, pos: number): MenuSpot {
	const c = caretXY(el, pos);
	const rect = el.getBoundingClientRect();
	return menuSpot(
		{ x: rect.left + c.x, y: rect.top + c.y, line: c.line },
		visibleArea(),
		SUGGEST_MENU
	);
}
