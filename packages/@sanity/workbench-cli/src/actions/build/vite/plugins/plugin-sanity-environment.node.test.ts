import {describe, expect, test} from 'vitest'

import {sanityEnvironmentPlugin} from './plugin-sanity-environment.js'

// The config hook returns a nested Vite config; `any` keeps the assertions readable.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Config = any

function getConfig(options: Parameters<typeof sanityEnvironmentPlugin>[0]): Config {
  const plugin = sanityEnvironmentPlugin(options)
  return (plugin.config as () => Config)()
}

async function buildOrder(config: Config): Promise<string[]> {
  const built: string[] = []
  await config.builder.buildApp({
    build: (env: string) => {
      built.push(env)
      return Promise.resolve()
    },
    environments: {client: 'client-env', federation: 'federation-env'},
  })
  return built
}

describe('sanityEnvironmentPlugin', () => {
  test('registers only the federation environment when there is no clientInput', async () => {
    const config = getConfig({input: '/project/.sanity/federation/remote-entry.jsx'})

    expect(config.environments.client).toBeUndefined()
    expect(config.environments.federation.build.emptyOutDir).toBe(false)
    expect(await buildOrder(config)).toEqual(['federation-env'])
  })

  test('registers a standalone SPA client environment and builds both when clientInput is set', async () => {
    const clientInput = '/project/.sanity/runtime/app.js'
    const config = getConfig({
      clientInput,
      input: '/project/.sanity/federation/remote-entry.jsx',
    })

    // emptyOutDir must be false on BOTH so neither build wipes the other's
    // output from the shared `dist`.
    expect(config.environments.federation.build.emptyOutDir).toBe(false)
    expect(config.environments.client.build.emptyOutDir).toBe(false)
    expect(config.environments.client.build.assetsDir).toBe('static')
    expect(config.environments.client.build.rollupOptions.input).toEqual({sanity: clientInput})

    // Both environments build in the single buildApp invocation.
    expect(await buildOrder(config)).toEqual(['client-env', 'federation-env'])
  })
})
