import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'

import {Config} from '@oclif/core'
import {expect, test} from 'vitest'

import {getPluginAdditions} from '../pluginAdditions.js'

test('loads commands from the private packaged plugin tree with no root installation edges', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cli-plugin-additions-'))
  try {
    await mkdir(join(root, 'commands'))
    await writeFile(
      join(root, 'package.json'),
      JSON.stringify({
        dependencies: {},
        name: 'sanity-plugin-fixture',
        oclif: {bin: 'sanity', commands: './commands', plugins: ['@sanity/runtime-cli']},
        type: 'module',
        version: '1.0.0',
      }),
    )
    const plugin = join(root, 'dist/node_modules/@sanity/runtime-cli')
    await mkdir(join(plugin, 'commands'), {recursive: true})
    await writeFile(join(plugin, 'index.js'), '')
    await writeFile(
      join(plugin, 'package.json'),
      JSON.stringify({
        main: './index.js',
        name: '@sanity/runtime-cli',
        oclif: {commands: './commands'},
        version: '1.0.0',
      }),
    )
    await writeFile(
      join(plugin, 'oclif.manifest.json'),
      JSON.stringify({
        commands: {
          'functions:local': {description: 'Local fixture command', id: 'functions:local'},
        },
        version: '1.0.0',
      }),
    )
    const manifest = pathToFileURL(join(root, 'dist/package.json'))
    expect(getPluginAdditions(manifest)).toEqual({})
    await writeFile(manifest, JSON.stringify({dependencies: {'@sanity/runtime-cli': '1.0.0'}}))
    const config = await Config.load({root, userPlugins: false, ...getPluginAdditions(manifest)})
    expect(config.findCommand('functions:local')?.description).toBe('Local fixture command')
    expect(config.plugins.get('@sanity/runtime-cli')?.root).toBe(
      plugin.replace(/^\/var\//, '/private/var/'),
    )
  } finally {
    await rm(root, {force: true, recursive: true})
  }
})
