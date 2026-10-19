import { toast, type ExternalToast } from 'svelte-sonner';

export interface ProgressToast {
	success: (message: string, data?: ExternalToast) => void;
	info: (message: string, data?: ExternalToast) => void;
	error: (message: string, data?: ExternalToast) => void;
}

export function progressToast(pending: string, data: ExternalToast = {}): ProgressToast {
	const id = toast.loading(pending, data);
	return {
		success: (message, more) => void toast.success(message, { ...data, ...more, id }),
		info: (message, more) => void toast(message, { ...data, ...more, id }),
		error: (message, more) => void toast.error(message, { ...data, ...more, id })
	};
}
