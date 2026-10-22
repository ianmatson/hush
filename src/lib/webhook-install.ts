import { api } from '$lib/api';
import { keys, queryClient } from '$lib/queries';

export async function refreshWebhooksAfterInstall() {
	await queryClient.cancelQueries({ queryKey: keys.webhooks });
	const access = await api.webhooks(true);
	queryClient.setQueryData(keys.webhooks, access);
	return access;
}
