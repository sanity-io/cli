import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import viteReact from '@vitejs/plugin-react'
import {createBuilder, type PluginOption} from 'vite'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'

import {federation} from '../../../../../../src/actions/build/vite/plugin.js'

// A workbench remote exposes generated render-contract shims (`.js`/`.jsx`), not
// the app's own source. This proves `@module-federation/vite` generates their
// `@mf-types` from that shim shape — the compile succeeds (an `@mf-types.zip`
// is only written when tsc exits clean) and the emitted declarations carry the
// render contract. It fails against a build that leaves type generation off.

// `@module-federation/vite` returns an empty plugin set when it detects vitest in
// the env; opt out so the real dts plugins run.
process.env.MFE_VITE_NO_TEST_ENV_CHECK = 'true'

// federated-studio is a workspace fixture with react installed; borrow its
// node_modules so the temp remote's shims (react, react-dom) resolve when bundled.
const FIXTURE_NODE_MODULES = path.resolve(
  __dirname,
  '../../../../../../../../../fixtures/federated-studio/node_modules',
)

let cwd: string
let dist: string

beforeAll(async () => {
  cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-generate-types-'))
  dist = path.join(cwd, 'dist')
  fs.symlinkSync(FIXTURE_NODE_MODULES, path.join(cwd, 'node_modules'), 'dir')

  fs.mkdirSync(path.join(cwd, 'src', 'views'), {recursive: true})
  fs.writeFileSync(
    path.join(cwd, 'package.json'),
    JSON.stringify({name: 'type-gen-remote', private: true, type: 'module', version: '0.0.0'}),
  )
  fs.writeFileSync(
    path.join(cwd, 'src', 'App.tsx'),
    'export default function App({title}: {title: string}) {\n  return <div>{title}</div>\n}\n',
  )
  fs.writeFileSync(
    path.join(cwd, 'src', 'views', 'panel.tsx'),
    'const view = {version: 1, components: {title: () => null, panel: () => null}}\nexport default view\n',
  )

  const plugins = federation({
    appEntry: '../../src/App.tsx',
    exposes: {views: [{name: 'feed', src: 'src/views/panel.tsx', type: 'panel'}]},
    isApp: true,
    pkgJson: {name: 'type-gen-remote', version: '0.0.0'},
    workDir: cwd,
  })

  const builder = await createBuilder({
    build: {outDir: dist},
    configFile: false,
    logLevel: 'silent',
    plugins: [viteReact(), plugins as PluginOption],
    root: cwd,
  })
  await builder.buildApp()
}, 120_000)

afterAll(() => {
  fs.rmSync(cwd, {force: true, recursive: true})
})

const compiledType = (relativeExpose: string) =>
  fs.readFileSync(path.join(dist, '@mf-types', 'compiled-types', relativeExpose), 'utf8')

describe('workbench remote type generation', () => {
  it('packages the exposes into a consumable @mf-types bundle', () => {
    // The zip and the loadRemote API declaration only land when tsc exits clean.
    expect(fs.existsSync(path.join(dist, '@mf-types.zip'))).toBe(true)
    expect(fs.existsSync(path.join(dist, '@mf-types.d.ts'))).toBe(true)
    expect(fs.existsSync(path.join(dist, '@mf-types', 'App.d.ts'))).toBe(true)
  })

  it('emits the render contract for the app entry', () => {
    expect(compiledType('remote-entry.d.ts')).toContain('export function render(')
  })

  it('emits the render contract and version for each view component', () => {
    for (const component of ['title', 'panel']) {
      const declaration = compiledType(`views/feed/${component}.d.ts`)
      expect(declaration).toContain('export function render(')
      expect(declaration).toContain('export const version')
    }
  })

  it('never compiles the app source into declarations', () => {
    // The shims import the app's modules only to render them; declaration emit
    // stays scoped to the shims, so the app's own source is never type-emitted.
    expect(fs.existsSync(path.join(dist, '@mf-types', 'compiled-types', 'src'))).toBe(false)
  })
})
