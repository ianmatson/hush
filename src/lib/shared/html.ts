export const escapeHtml = (s: string) =>
	s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const HTML_TAG = /<[^>]*>/g;
const HTML_ENTITY = /&(?:amp|lt|gt|quot|#39|nbsp);/g;
const HTML_ENTITIES: Record<string, string> = {
	'&amp;': '&',
	'&lt;': '<',
	'&gt;': '>',
	'&quot;': '"',
	'&#39;': "'",
	'&nbsp;': ' '
};

export function htmlToPlainText(html: string): string {
	return html
		.replace(HTML_TAG, '')
		.replace(HTML_ENTITY, (entity) => HTML_ENTITIES[entity])
		.replace(/\s+/g, ' ')
		.trim();
}
