/* eslint-disable no-console */
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {once} from 'node:events'
import {appendFile, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import {createServer} from 'node:http'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {execa} from 'execa'

const [archive, budget] = process.argv.slice(2)
const budgetSeconds = Number(budget)
if (!archive || !Number.isFinite(budgetSeconds) || budgetSeconds <= 0) {
  throw new Error('Usage: node scripts/bench-create-sanity.mjs <launcher.tgz> <budget-seconds>')
}

const bytes = await readFile(archive)
const {stdout: manifestSource} = await execa('tar', ['-xOf', archive, 'package/package.json'])
const manifest = JSON.parse(manifestSource)
const integrity = 'sha512-' + createHash('sha512').update(bytes).digest('base64')

const projectId = 'abc123'
const stackId = 'ST-benchmark'
const dataset = 'production'
const responses = new Map([
  ['GET /datasets', [{aclMode: 'public', name: dataset}]],
  ['GET /users/me', {id: 'benchmark-user'}],
  ['POST /blueprints/stacks', {id: stackId}],
])
const tarballPath = '/create-sanity/-/launcher.tgz'
let registryUrl
const api = createServer((request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname
  if (path === tarballPath) {
    response.writeHead(200, {'content-type': 'application/octet-stream'}).end(bytes)
    return
  }

  const requestKey = `${request.method} ${path.replace(/^\/v\d{4}-\d{2}-\d{2}\//, '/')}`
  const body =
    path === '/create-sanity'
      ? {
          'dist-tags': {latest: manifest.version},
          name: 'create-sanity',
          versions: {
            [manifest.version]: {
              ...manifest,
              dist: {integrity, tarball: registryUrl + tarballPath},
            },
          },
        }
      : responses.get(requestKey)
  response.writeHead(body ? 200 : 404, {'content-type': 'application/json'})
  response.end(JSON.stringify(body ?? {message: `Unexpected fixture request ${requestKey}`}))
})

const scratch = await mkdtemp(join(tmpdir(), 'sanity-cold-start-'))
try {
  const dnsHook = join(scratch, 'dns.cjs')
  // The datasets client uses a project subdomain, which may not resolve on the runner.
  await writeFile(
    dnsHook,
    `const dns = require('node:dns')
const lookup = dns.lookup
dns.lookup = (hostname, ...args) =>
  lookup(hostname === '${projectId}.localhost' ? '127.0.0.1' : hostname, ...args)
require('node:module').syncBuiltinESMExports()
`,
  )
  api.listen(0, '127.0.0.1')
  await once(api, 'listening')
  const port = api.address().port
  const apiUrl = `http://localhost:${port}`
  registryUrl = `http://127.0.0.1:${port}`

  const seconds = []
  for (let sample = 0; sample < 3; sample += 1) {
    const cwd = await mkdtemp(join(scratch, 'sample-'))
    const start = performance.now()
    await execa(
      'npm',
      [
        'create',
        '--yes',
        'sanity@latest',
        '--',
        '--with-blueprints',
        '--yes',
        '--project',
        projectId,
        '--dataset',
        dataset,
      ],
      {
        cwd,
        env: {
          DO_NOT_TRACK: '1',
          NODE_OPTIONS: `--require=${JSON.stringify(dnsHook)}`,
          npm_config_audit: 'false',
          npm_config_cache: join(cwd, 'npm-cache'),
          npm_config_registry: registryUrl,
          npm_config_userconfig: join(scratch, 'empty.npmrc'),
          SANITY_AUTH_TOKEN: 'benchmark-token',
          SANITY_INTERNAL_ENV: apiUrl,
          XDG_CACHE_HOME: join(cwd, 'xdg-cache'),
        },
        timeout: 30_000,
      },
    )
    seconds.push((performance.now() - start) / 1000)
    const blueprint = JSON.parse(await readFile(join(cwd, 'sanity.blueprint.json'), 'utf8'))
    const config = JSON.parse(await readFile(join(cwd, '.sanity/blueprint.config.json'), 'utf8'))
    assert.equal(blueprint.values.dataset, dataset)
    assert.equal(config.projectId, projectId)
    assert.equal(config.stackId, stackId)
  }

  const {stdout: npmVersion} = await execa('npm', ['--version'])
  const median = seconds.toSorted((a, b) => a - b)[1]
  const samples = seconds.map((value) => value.toFixed(2)).join(', ')
  const size = bytes.length / 1_000_000
  const overBudget = median > budgetSeconds
  const result = overBudget ? 'Above budget' : 'Within budget'
  const summary = [
    '## Cold Blueprint setup',
    '',
    `Node ${process.version}, npm ${npmVersion}. Empty npm cache per run, local registry and API fixture.`,
    '',
    '| Runs (s) | Median (s) | Budget (s) | Tarball (MB) | Result |',
    '| --- | ---: | ---: | ---: | --- |',
    `| ${samples} | ${median.toFixed(2)} | ${budgetSeconds.toFixed(2)} | ${size.toFixed(2)} | ${result} |`,
  ].join('\n')
  console.log(summary)
  if (overBudget) {
    console.log(
      `::warning title=Cold Blueprint setup::Median ${median.toFixed(2)}s exceeded the ${budgetSeconds.toFixed(2)}s budget.`,
    )
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`)
  }
} finally {
  api.close()
  await rm(scratch, {force: true, recursive: true})
}
