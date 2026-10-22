import { api } from '$lib/api';
import { itemFieldWriteQueue } from '$lib/item-field-writes';
import { keys, queryClient, refetchUnlessLive } from '$lib/queries';

export const writeItemField = itemFieldWriteQueue(api.editItemField, ({ repo, number }) => {
	void queryClient.invalidateQueries({ queryKey: keys.peek(repo, number) });
	refetchUnlessLive(keys.items);
});
