import {once} from 'node:events'
import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises'
import {createServer} from 'node:http'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {expect, test} from 'vitest'

import {runCli} from '../helpers/runCli.js'

test('prints declarations, guards linked resources, and redirects copies behind the rollout flag', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cli-blueprint-commands-'))
  const requests: Array<{method?: string; path?: string; scope?: string | string[]}> = []
  const server = createServer((request, response) => {
    if (request.url === '/') {
      response.end('pong')
      return
    }
    requests.push({
      method: request.method,
      path: request.url,
      scope: request.headers['x-sanity-scope-id'],
    })
    response.setHeader('Content-Type', 'application/json')
    response.end(
      JSON.stringify({
        name: 'Review Stack',
        resources: [{externalId: 'test-project:production', type: 'sanity.project.dataset'}],
      }),
    )
  })

  try {
    const cwd = join(dir, 'src')
    await mkdir(cwd)
    await mkdir(join(dir, '.sanity'))
    await writeFile(
      join(dir, '.sanity', 'blueprint.config.json'),
      JSON.stringify({projectId: 'test-project', stackId: 'ST-1234567890'}),
    )
    await once(server.listen(0, '127.0.0.1'), 'listening')
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Expected a TCP address')

    const settings = {
      cwd,
      env: {
        CI: '1',
        DO_NOT_TRACK: '1',
        SANITY_AUTH_TOKEN: 'test-token',
        SANITY_INTERNAL_ENV: `http://127.0.0.1:${address.port}`,
      },
    }
    const create = await runCli({
      ...settings,
      args: ['datasets', 'create', 'preview', '--visibility', 'private', '--with-blueprints'],
    })
    expect(create.exitCode, create.stderr).toBe(0)
    expect(create.stdout).toContain('sanity blueprints plan')
    expect(create.stdout).toContain('"project": "test-project"')
    expect(create.stdout).toContain('"datasetName": "preview"')
    expect(requests).toEqual([])

    const remove = await runCli({
      ...settings,
      args: ['datasets', 'delete', 'production', '--force', '--with-blueprints'],
    })
    expect(remove.exitCode, remove.stderr).toBe(2)
    expect(remove.stderr).toContain('Blueprint Stack "Review Stack" manages dataset "production"')
    expect(requests).toEqual([
      {
        method: 'GET',
        path: expect.stringContaining('/blueprints/stacks/ST-1234567890'),
        scope: 'test-project',
      },
    ])

    const copy = await runCli({
      ...settings,
      args: ['datasets', 'copy', '--with-blueprints'],
    })
    expect(copy.exitCode, copy.stderr).toBe(2)
    expect(copy.stderr).toContain('Dataset copy creates a new dataset.')
    const plan = await runCli({
      ...settings,
      args: ['deploy', '--dry-run', '--with-blueprints'],
    })
    expect(plan.exitCode, plan.stderr).toBe(2)
    expect(plan.stderr).toContain('sanity blueprints plan')
    expect(requests).toHaveLength(1)
  } finally {
    if (server.listening) {
      const closed = once(server, 'close')
      server.close()
      await closed
    }
    await rm(dir, {force: true, recursive: true})
  }
})
