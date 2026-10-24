const FOCUS =
	'focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none data-[state=open]:bg-muted';

export const FIELD_BADGE = `flex h-6 min-w-0 shrink-0 items-center gap-1.5 rounded-full border px-2 text-xs font-medium whitespace-nowrap text-foreground hover:bg-muted ${FOCUS}`;

export const EMPTY_FIELD_BADGE = `flex h-6 shrink-0 items-center gap-1 rounded-full border border-dashed px-2 text-xs whitespace-nowrap text-muted-foreground hover:bg-muted hover:text-foreground data-[state=open]:text-foreground ${FOCUS}`;

export const FIELD_ICON_BUTTON = `flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground data-[state=open]:text-foreground ${FOCUS}`;
