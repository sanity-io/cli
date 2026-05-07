// Intentionally a `.cjs` file so it is loaded via Node's native CJS require
// rather than through vite-node's runner. vite-node rewrites `import()` calls
// in any code IT loaded into its own runner-based dynamic import — that re-SSR-
// transforms whatever we try to import, defeating the purpose of pre-bundling.
//
// Code in this file is never seen by vite-node, so the `import()` here is the
// host's untransformed dynamic import.
/* eslint-disable no-undef, no-restricted-syntax */
module.exports = function nativeImport(url) {
  return import(url)
}
