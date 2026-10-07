#!/bin/sh
set -eu

source_checkout="${PASEO_SOURCE_CHECKOUT_PATH:-}"

pnpm install --frozen-lockfile

if [ -n "$source_checkout" ] && [ -f "$source_checkout/.dev.vars" ]; then
	cp "$source_checkout/.dev.vars" .dev.vars
else
	echo "No .dev.vars to copy. See README → Local development to create one." >&2
fi

if [ -n "$source_checkout" ] && [ -d "$source_checkout/.wrangler/state" ] && [ ! -d .wrangler/state ]; then
	mkdir -p .wrangler
	cp -R "$source_checkout/.wrangler/state" .wrangler/state
fi

pnpm db:migrate:local
