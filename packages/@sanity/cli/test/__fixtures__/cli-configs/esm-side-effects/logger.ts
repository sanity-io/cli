// Side-effect: sets a global flag when imported
;(globalThis as Record<string, unknown>).__CLI_CONFIG_LOADED__ = true

export const logPrefix = '[sanity]'
