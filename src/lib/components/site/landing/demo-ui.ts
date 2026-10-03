type ClassPart = string | false | null | undefined;

export const cx = (...parts: ClassPart[]) => parts.filter(Boolean).join(' ');

const BUTTON_BASE =
	"inline-flex shrink-0 items-center justify-center border bg-clip-padding font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4";

const BUTTON_VARIANT = {
	default: 'border-transparent bg-primary text-primary-foreground hover:bg-primary/80',
	outline:
		'border-border bg-background hover:bg-muted hover:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50 aria-expanded:bg-muted',
	ghost: 'border-transparent hover:bg-muted hover:text-foreground dark:hover:bg-muted/50',
	destructive:
		'border-transparent bg-destructive/10 text-destructive hover:bg-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30'
};

const BUTTON_SIZE = {
	xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs [&_svg:not([class*='size-'])]:size-3",
	sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] [&_svg:not([class*='size-'])]:size-3.5",
	'icon-sm': 'size-7 rounded-[min(var(--radius-md),12px)]'
};

export type ButtonVariant = keyof typeof BUTTON_VARIANT;
export type ButtonSize = keyof typeof BUTTON_SIZE;

export const buttonClass = (variant: ButtonVariant, size: ButtonSize, extra?: ClassPart) =>
	cx(BUTTON_BASE, BUTTON_VARIANT[variant], BUTTON_SIZE[size], extra);
