import { PROJECT_ACCESS_NEEDED } from './shared/projects';

/** Turn GitHub's token errors into advice. Returns null for other errors. */
export function tokenHelp(message: string): { title: string; body: string } | null {
	const org = message.match(
		/`([^`]+)` forbids access via a personal access token \(classic\)/
	)?.[1];
	if (org)
		return {
			title: `${org} blocks classic tokens`,
			body: `GitHub hides ${org} notifications and search results from this token. Add a token that ${org} allows as a custom token in Settings → General → GitHub access.`
		};
	const restricted = message.match(
		/the `([^`]+)` organization has enabled OAuth App access restrictions/
	)?.[1];
	if (restricted)
		return {
			title: `${restricted} has not approved Hush`,
			body: `GitHub hides ${restricted} pull requests, issues, and teams from your GitHub sign-in, so they are missing here. Ask an owner of ${restricted} to approve Hush, or use a custom token until then.`
		};
	if (message === PROJECT_ACCESS_NEEDED)
		return {
			title: 'Hush has no project access',
			body: 'A source reads a project board, and your token is older than project boards in Hush. Sign in with GitHub again. For a custom token from the GitHub CLI, run "gh auth refresh -s project" and replace the token.'
		};
	if (/SAML|single sign-on|SSO/i.test(message))
		return {
			title: 'Your token is not authorized for SAML single sign-on',
			body: 'Sign in again and authorize the org when GitHub asks. For a custom token: on github.com/settings/tokens, choose "Configure SSO" next to it and authorize the org.'
		};
	return null;
}
