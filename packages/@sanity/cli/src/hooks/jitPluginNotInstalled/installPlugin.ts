import {join} from 'node:path'

import {type Config, type Hook} from '@oclif/core'
import {installDeferredPackage} from '@sanity/cli-core/installDeferredPackage'

export const installPlugin: Hook.JitPluginNotInstalled = async function ({
  argv,
  config,
  id,
  pluginName,
  pluginVersion,
}) {
  const cliConfig = config as Config

  const installation = await installDeferredPackage(pluginName, pluginVersion, {
    cacheDir: join(config.cacheDir, 'dependencies'),
    registry: config.npmRegistry,
  })
  cliConfig.options.pluginAdditions = {core: [pluginName], path: installation}
  await cliConfig.loadPluginsAndCommands({force: true})
  const pluginInit = {argv, deferredPlugin: pluginName, id}
  await cliConfig.runHook('init', pluginInit)
}
