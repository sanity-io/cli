import {cp, mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'

import {doImport} from '@sanity/cli-core/util'
import {expect, test} from 'vitest'

import {prepareWorkflowHooks} from '../package-workflow-hooks.js'

test('workflow hooks preserve the real command guard, context and arguments', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cli-workflow-hooks-'))
  try {
    const plugin = join(root, 'dist/node_modules/@sanity/workflow-cli/dist')
    await mkdir(plugin, {recursive: true})
    await writeFile(join(root, 'package.json'), '{"type":"module"}')
    await cp(
      fileURLToPath(
        new URL('../../node_modules/@sanity/workflow-cli/dist/command-ids.js', import.meta.url),
      ),
      join(plugin, 'command-ids.js'),
    )
    const core = join(root, 'dist/node_modules/@sanity/cli-core')
    await mkdir(core, {recursive: true})
    await writeFile(
      join(core, 'package.json'),
      '{"type":"module","exports":{"./util":"./util.js"}}',
    )
    await writeFile(join(core, 'util.js'), 'export const doImport = (url) => import(url)')
    for (const event of ['prerun', 'finally']) {
      const hookDir = join(plugin, 'hooks', event)
      await mkdir(hookDir, {recursive: true})
      await writeFile(
        join(hookDir, 'telemetry.js'),
        `import {writeFile} from 'node:fs/promises'; await writeFile(new URL('loaded', import.meta.url), 'yes'); export default function(options) { return {context: this, options}; }`,
      )
    }
    await prepareWorkflowHooks(root)
    for (const event of ['prerun', 'finally']) {
      const hookDir = join(plugin, 'hooks', event)
      const {default: hook} = await doImport(pathToFileURL(join(hookDir, 'telemetry.js')).href)
      for (const id of [undefined, 'init', 'build', 'workflows-other']) {
        await expect(
          hook({Command: id ? {id} : undefined, config: {bin: 'sanity'}}),
        ).resolves.toBeUndefined()
      }
      await expect(readFile(join(hookDir, 'loaded'))).rejects.toMatchObject({code: 'ENOENT'})
      const context = {event}
      for (const [bin, id] of [
        ['sanity', 'workflows'],
        ['sanity', 'workflows:deploy'],
        ['sanity-workflows', 'any'],
      ]) {
        const options = {Command: {id}, config: {bin}}
        await expect(hook.call(context, options)).resolves.toEqual({context, options})
      }
      expect(await readFile(join(hookDir, 'loaded'), 'utf8')).toBe('yes')
    }
  } finally {
    await rm(root, {force: true, recursive: true})
  }
})
