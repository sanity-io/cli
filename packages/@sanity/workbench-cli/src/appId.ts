/**
 * File the build writes into its output, carrying the id compiled into the
 * bundle. `sanity start` serves a build without recompiling, so it reads this
 * instead of recomputing — a deploy inlines the API id, which the config may lack.
 */
export const SANITY_APP_ID_FILE = 'sanity-app-id.txt'
