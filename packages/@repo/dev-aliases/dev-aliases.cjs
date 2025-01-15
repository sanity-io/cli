// NOTE: THIS FILE NEEDS TO REMAIN COMMONJS
// It can be converted to ESM/TS when we either not use jest anymore, or node/jest runner natively supports ESM (including with import.meta etc).

/**
 * The path mappings/aliases used by various tools in the monorepo to map imported modules to
 * source files in order to speed up rebuilding and avoid having a separate watcher process to build
 * from `src` to `lib`.
 *
 * This file is currently read by:
 * - Vite when running the dev server (only when running in this monorepo)
 * - jest when running test suite
 *
 * @type Record<string, string>
 */
const devAliases = {
  // NOTE: do not use regex in the module expressions,
  // because they will be escaped by the jest config
  '@sanity/migrate': '@sanity/migrate/src/_exports',
}

module.exports = devAliases
