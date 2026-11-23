import {once} from 'node:events'
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import {createServer} from 'node:http'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {expect, test} from 'vitest'

import {runCli} from '../helpers/runCli.js'

test('selects a global Blueprint profile without loading the working directory configuration', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cli-blueprint-profile-'))
  try {
    const studio = join(root, 'studio')
    const scratch = join(root, 'scratch')
    await Promise.all([mkdir(studio), mkdir(scratch)])
    const configRead = join(studio, 'classic-config-read')
    await writeFile(
      join(studio, 'sanity.cli.js'),
      `require('node:fs').writeFileSync(${JSON.stringify(configRead)}, 'read')
module.exports = {api: {projectId: 'classicproject'}}`,
    )
    await writeFile(join(studio, '.env'), 'SANITY_PROJECT_ID=wrongproject\n')
    await writeFile(join(studio, 'sanity.blueprint-cli.json'), 'invalid local marker')

    const env = {
      CI: '1',
      SANITY_AUTH_TOKEN: '',
      SANITY_BLUEPRINT_CONFIG_DIR: join(root, 'profiles'),
      SANITY_BLUEPRINT_PROFILE: '',
      SANITY_CLI_MODE: '',
      SANITY_PROJECT_ID: '',
    }
    const configured = await runCli({
      args: ['blueprints', 'profiles', 'set', 'preview', '--project', 'profileproject'],
      cwd: studio,
      env,
    })
    expect(configured.exitCode, configured.stderr).toBe(0)
    expect(configured.stdout).toContain('SANITY_BLUEPRINT_PROFILE=preview')

    for (const cwd of [studio, scratch]) {
      const result = await runCli({
        args: ['datasets', 'create', 'preview', '--visibility', 'private'],
        cwd,
        env: {...env, SANITY_BLUEPRINT_PROFILE: 'preview'},
      })
      expect(result.exitCode, result.stderr).toBe(0)
      expect(result.stdout).toContain('"project": "profileproject"')
      expect(result.stdout).toContain('"type": "sanity.project.dataset"')
    }
    await expect(readFile(configRead, 'utf8')).rejects.toMatchObject({code: 'ENOENT'})

    const legacy = await runCli({
      args: ['datasets', 'list'],
      cwd: studio,
      env: {...env, SANITY_BLUEPRINT_PROFILE: 'preview', SANITY_CLI_MODE: 'legacy'},
    })
    expect(legacy.stderr).toMatch(/login/i)
    await expect(readFile(configRead, 'utf8')).resolves.toBe('read')
  } finally {
    await rm(root, {force: true, recursive: true})
  }
})

test('passes a global profile to Runtime without using the local Stack link', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cli-blueprint-runtime-profile-'))
  const checkout = join(root, 'checkout')
  const stack = 'ST-9876543210'
  const organization = 'profile-organization'
  const requestedTargets: Array<{path: string | undefined; scope: string | string[] | undefined}> =
    []
  const server = createServer((request, response) => {
    if (request.url === '/') {
      response.end('pong')
      return
    }
    requestedTargets.push({path: request.url, scope: request.headers['x-sanity-scope-id']})
    response.setHeader('Content-Type', 'application/json')
    response.end(JSON.stringify({id: stack, name: 'Profile Stack', resources: []}))
  })

  try {
    await mkdir(join(checkout, '.sanity'), {recursive: true})
    await writeFile(
      join(checkout, '.sanity', 'blueprint.config.json'),
      JSON.stringify({projectId: 'checkout-project', stackId: 'ST-1111111111'}),
    )
    await once(server.listen(0, '127.0.0.1'), 'listening')
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Expected a TCP address')

    const env = {
      CI: '1',
      SANITY_AUTH_TOKEN: 'test-only',
      SANITY_BLUEPRINT_CONFIG_DIR: join(root, 'profiles'),
      SANITY_BLUEPRINT_PATH: '',
      SANITY_BLUEPRINT_PROFILE: '',
      SANITY_BLUEPRINT_STACK_ID: '',
      SANITY_CLI_MODE: '',
      SANITY_INTERNAL_ENV: `http://127.0.0.1:${address.port}/`,
      SANITY_ORGANIZATION_ID: '',
      SANITY_PROJECT_ID: '',
    }
    const setup = await runCli({
      args: [
        'blueprints',
        'profiles',
        'set',
        'preview',
        '--organization',
        organization,
        '--stack',
        stack,
      ],
      cwd: checkout,
      env,
    })
    expect(setup.exitCode, setup.stderr).toBe(0)

    const info = await runCli({
      args: ['blueprints', 'info', '--json'],
      cwd: checkout,
      env: {...env, SANITY_BLUEPRINT_PROFILE: 'preview'},
    })
    expect(info.exitCode, info.stderr).toBe(0)
    expect(JSON.parse(info.stdout).stack).toMatchObject({id: stack, name: 'Profile Stack'})
    expect(requestedTargets).toEqual([
      {path: expect.stringContaining(`/blueprints/stacks/${stack}`), scope: organization},
    ])
  } finally {
    if (server.listening) {
      const closed = once(server, 'close')
      server.close()
      await closed
    }
    await rm(root, {force: true, recursive: true})
  }
})
