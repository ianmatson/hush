/** Turn GitHub's token errors into advice. Returns null for other errors. */
export function tokenHelp(message: string): { title: string; body: string } | null {
	const org = message.match(
		/`([^`]+)` forbids access via a personal access token \(classic\)/
	)?.[1];
	if (org)
		return {
			title: `${org} blocks classic tokens`,
			body: `GitHub hides ${org} notifications and search results from this token. Sign in again with a token that ${org} allows (see the sign-in page).`
		};
	if (/SAML|single sign-on|SSO/i.test(message))
		return {
			title: 'Your token is not authorized for SAML single sign-on',
			body: 'On github.com/settings/tokens, choose "Configure SSO" next to the token and authorize the org. Then sign in again.'
		};
	return null;
}
