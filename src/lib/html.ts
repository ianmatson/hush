import DOMPurify from 'dompurify';
import { inAppPathForGitHubUrl } from '$lib/shared/in-app-links';

let hooked = false;
let taskCheckboxesEnabled = false;

function setTaskCheckboxState(input: Element) {
	if (taskCheckboxesEnabled && input.getAttribute('type') === 'checkbox')
		input.removeAttribute('disabled');
	else input.setAttribute('disabled', '');
}

function pointLink(link: Element) {
	const inAppPath = inAppPathForGitHubUrl(link.getAttribute('href') ?? '');
	if (inAppPath) {
		link.setAttribute('href', inAppPath);
		link.removeAttribute('target');
		link.removeAttribute('rel');
		return;
	}
	link.setAttribute('target', '_blank');
	link.setAttribute('rel', 'noopener noreferrer');
}

/**
 * Clean GitHub's rendered HTML before it goes into the page. GitHub already sanitizes it, but
 * Hush must not trust that: this is the only place where remote HTML reaches the DOM.
 */
export function sanitize(html: string, { editableTasks = false } = {}): string {
	if (!hooked) {
		DOMPurify.addHook('afterSanitizeAttributes', (node) => {
			if (node.tagName === 'A') pointLink(node);
			if (node.tagName === 'IMG') {
				node.setAttribute('loading', 'lazy');
				node.setAttribute('referrerpolicy', 'no-referrer');
			}
			if (node.tagName === 'INPUT') setTaskCheckboxState(node);
		});
		hooked = true;
	}
	taskCheckboxesEnabled = editableTasks;
	try {
		return DOMPurify.sanitize(html, {
			FORBID_TAGS: ['style', 'form', 'button', 'textarea', 'select', 'iframe'],
			FORBID_ATTR: ['style']
		});
	} finally {
		taskCheckboxesEnabled = false;
	}
}
