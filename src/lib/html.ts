import DOMPurify from 'dompurify';

let hooked = false;

/**
 * Clean GitHub's rendered HTML before it goes into the page. GitHub already sanitizes it, but
 * Hush must not trust that: this is the only place where remote HTML reaches the DOM.
 */
export function sanitize(html: string): string {
	if (!hooked) {
		DOMPurify.addHook('afterSanitizeAttributes', (node) => {
			if (node.tagName === 'A') {
				node.setAttribute('target', '_blank');
				node.setAttribute('rel', 'noopener noreferrer');
			}
			if (node.tagName === 'IMG') {
				node.setAttribute('loading', 'lazy');
				node.setAttribute('referrerpolicy', 'no-referrer');
			}
			// Task-list checkboxes are for show only.
			if (node.tagName === 'INPUT') node.setAttribute('disabled', '');
		});
		hooked = true;
	}
	return DOMPurify.sanitize(html, {
		FORBID_TAGS: ['style', 'form', 'button', 'textarea', 'select', 'iframe'],
		FORBID_ATTR: ['style']
	});
}
