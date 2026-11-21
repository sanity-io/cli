import {readFile, writeFile} from 'node:fs/promises'
import {join} from 'node:path'

import {Plugin} from '@oclif/core'

import oclifConfig from '../oclif.config.js'

const root = process.cwd()
const plugin = new Plugin({errorOnManifestCreate: true, ignoreManifest: true, root, type: 'core'})
await plugin.load()

for (const pluginName of Object.keys(oclifConfig.jitPlugins)) {
  const file = join(root, 'node_modules', pluginName, 'oclif.manifest.json')
  const {commands} = JSON.parse(await readFile(file, 'utf8'))
  for (const command of Object.values(commands)) {
    if (command.pluginName !== pluginName) continue
    plugin.manifest.commands[command.id] = {...command, pluginType: 'jit'}
  }
}

await writeFile(join(root, 'oclif.manifest.json'), JSON.stringify(plugin.manifest, null, 2))
