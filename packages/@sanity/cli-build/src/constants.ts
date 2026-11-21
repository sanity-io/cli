/**
 * Root directory (relative to the project) used by Sanity tooling for
 * build-time artifacts and caches — Vite's `cacheDir` and the dev-time
 * manifest output. Lives under `node_modules/` so it's out of `dist` and
 * ignored by default in typical `.gitignore` files.
 */
export {SANITY_CACHE_DIR} from '@sanity/cli-core/config'
