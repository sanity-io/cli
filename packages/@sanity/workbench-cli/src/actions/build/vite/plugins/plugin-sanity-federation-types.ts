import fs from 'node:fs'
import path from 'node:path'

import {type Plugin} from 'vite'

import {DTS_TSCONFIG_PATH} from '../constants.js'

// The tsconfig `@module-federation/vite` compiles the exposes with — the build
// owns it rather than reusing the app's, whose options break the compile.
// - `allowJs`: the exposes are generated `.js`/`.jsx` shims; no app template sets it.
// - `rootDir: '.'` + `noResolve`: keep the program to the shims alone. They import
//   the app's modules to render them; resolving those drags noEmit app code into
//   declaration emit, which fails on real projects (TS6059 outside rootDir,
//   TS2742/TS4082 on types never meant to emit). Opaque imports can't break it.
// - `skipLibCheck` + `types: []`: with imports opaque the shims need no `@types`;
//   loading them (e.g. `@types/react`) only adds lib-check errors.
const DTS_TSCONFIG = {
  compilerOptions: {allowJs: true, noResolve: true, rootDir: '.', skipLibCheck: true, types: []},
}

/**
 * Writes {@link DTS_TSCONFIG} into the runtime dir, next to the exposes
 * `@module-federation/vite` points its type generation at.
 */
export function sanityFederationTypes(): Plugin {
  return {
    configResolved(config) {
      const tsconfigPath = path.resolve(config.root, DTS_TSCONFIG_PATH)
      fs.mkdirSync(path.dirname(tsconfigPath), {recursive: true})
      fs.writeFileSync(tsconfigPath, JSON.stringify(DTS_TSCONFIG, null, 2))
    },
    name: 'sanity/federation-types',
  }
}
