import {once} from 'node:events'
import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises'
import {createServer} from 'node:http'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {expect, test} from 'vitest'

import {runCli} from '../helpers/runCli.js'

test('discovers a Stack from a subdirectory and handles an ambiguous dataset', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cli-blueprint-target-'))
  const nested = join(root, 'src')
  const requests: Array<{path: string | undefined; scope: unknown; scopeType: unknown}> = []
  const server = createServer((request, response) => {
    if (request.url === '/') {
      response.end('pong')
      return
    }
    requests.push({
      path: request.url,
      scope: request.headers['x-sanity-scope-id'],
      scopeType: request.headers['x-sanity-scope-type'],
    })
    response.setHeader('Content-Type', 'application/json')
    response.end(
      JSON.stringify({
        resources: [
          {externalId: 'test-project:preview', type: 'sanity.project.dataset'},
          {externalId: 'test-project:production', type: 'sanity.project.dataset'},
          {externalId: null, name: 'future-dataset', type: 'sanity.project.dataset'},
        ],
      }),
    )
  })

  try {
    await mkdir(join(root, '.sanity'))
    await mkdir(nested)
    await writeFile(
      join(root, '.sanity', 'blueprint.config.json'),
      JSON.stringify({projectId: 'test-project', stackId: 'ST-1234567890'}),
    )
    await once(server.listen(0, '127.0.0.1'), 'listening')
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Expected a TCP address')

    const args = ['documents', 'query', '*[0...1]']
    const env = {
      CI: '1',
      DO_NOT_TRACK: '1',
      SANITY_AUTH_TOKEN: 'test-token',
      SANITY_INTERNAL_ENV: `http://127.0.0.1:${address.port}`,
      TERM: 'xterm-256color',
    }
    const classic = await runCli({args, cwd: nested, env})
    expect(classic.exitCode, classic.stderr).not.toBe(0)
    expect(classic.stderr).toContain('Unable to determine project ID')
    expect(requests).toEqual([])

    const blueprintArgs = [...args, '--with-blueprints']
    const unattended = await runCli({args: blueprintArgs, cwd: nested, env})
    expect(unattended.exitCode, unattended.stderr).not.toBe(0)
    const message = unattended.stderr.replaceAll(/\s+/g, ' ')
    expect(message).toContain('Multiple deployed datasets match the linked Stack.')
    expect(message).toContain('`--dataset <name>`.')

    const terminal = await runCli({args: blueprintArgs, cwd: nested, env, interactive: true})
    await terminal.waitForText(/Select a dataset from this Stack/)
    await terminal.waitForText(/preview/)
    await terminal.waitForText(/production/)
    expect(terminal.getOutput()).not.toContain('future-dataset')
    terminal.sendControl('c')
    await terminal.waitForExit('any')

    const expected = {
      path: expect.stringContaining('/blueprints/stacks/ST-1234567890'),
      scope: 'test-project',
      scopeType: 'project',
    }
    expect(requests, JSON.stringify(requests)).toEqual([expected, expected])
  } finally {
    if (server.listening) {
      const closed = once(server, 'close')
      server.close()
      await closed
    }
    await rm(root, {force: true, recursive: true})
  }
})
