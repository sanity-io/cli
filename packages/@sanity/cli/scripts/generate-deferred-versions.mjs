import {readFile, writeFile} from 'node:fs/promises'

const packages = [
  '@sanity/cli-build',
  '@sanity/codegen',
  '@sanity/workbench-cli',
  'tar-stream',
  'vite',
]
const versions = Object.fromEntries(
  await Promise.all(
    packages.map(async (name) => {
      const file = new URL(`../node_modules/${name}/package.json`, import.meta.url)
      const {version} = JSON.parse(await readFile(file, 'utf8'))
      return [name, version]
    }),
  ),
)
const source = `export const deferredVersions = ${JSON.stringify(versions, null, 2)} as const\n`
await writeFile(new URL('../src/generated/deferredVersions.ts', import.meta.url), source)
