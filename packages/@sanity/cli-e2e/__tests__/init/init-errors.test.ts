import {describe, expect, test} from 'vitest'

import {runCli} from '../../helpers/runCli.js'

// These tests verify the CLI rejects invalid input before doing any work.
// No authentication or API calls are needed — all set SANITY_AUTH_TOKEN to empty.
const noAuth = {SANITY_AUTH_TOKEN: ''}

describe('sanity init - error & flag validation', () => {
  test('1.1 rejects deprecated --reconfigure flag', async () => {
    const {exitCode, stderr} = await runCli({
      args: ['init', '--reconfigure'],
      env: noAuth,
    })
    expect(exitCode).toBe(1)
    expect(stderr).toContain('--reconfigure is deprecated')
  })

  test('1.2 rejects deprecated plugin type', async () => {
    const {exitCode, stderr} = await runCli({
      args: ['init', 'plugin'],
      env: noAuth,
    })
    expect(exitCode).toBe(1)
    expect(stderr).toContain('no longer supported')
  })

  test('1.3 rejects unknown init type', async () => {
    const {exitCode, stderr} = await runCli({
      args: ['init', 'foobar'],
      env: noAuth,
    })
    expect(exitCode).toBe(1)
    expect(stderr).toContain('Unknown init type')
  })

  test('1.4 rejects conflicting --project + --organization', async () => {
    const {exitCode, stderr} = await runCli({
      args: ['init', '--project', 'abc123', '--organization', 'org456'],
      env: noAuth,
    })
    expect(exitCode).toBe(1)
    expect(stderr).toContain('specified both a project and an organization')
  })

  test('1.5 unattended requires --dataset', async () => {
    const {exitCode, stderr} = await runCli({
      args: ['init', '-y', '--project', 'abc123', '--output-path', '/tmp/out'],
      env: noAuth,
    })
    expect(exitCode).toBe(1)
    expect(stderr).toContain('`--dataset` must be specified')
  })

  test('1.6 unattended requires --output-path', async () => {
    const {exitCode, stderr} = await runCli({
      args: ['init', '-y', '--project', 'abc123', '--dataset', 'prod'],
      env: noAuth,
    })
    expect(exitCode).toBe(1)
    expect(stderr).toContain('`--output-path` must be specified')
  })

  test('1.7 unattended requires project identifier', async () => {
    const {exitCode, stderr} = await runCli({
      args: ['init', '-y', '--dataset', 'prod', '--output-path', '/tmp/out'],
      env: noAuth,
    })
    expect(exitCode).toBe(1)
    expect(stderr).toContain('`--project <id>` or `--project-name <name>`')
  })

  test('1.8 --project-name requires --organization in unattended mode', async () => {
    const {exitCode, stderr} = await runCli({
      args: [
        'init',
        '-y',
        '--project-name',
        'Foo',
        '--dataset',
        'prod',
        '--output-path',
        '/tmp/out',
      ],
      env: noAuth,
    })
    expect(exitCode).toBe(1)
    expect(stderr).toContain('`--project-name` requires `--organization')
  })

  test('1.9 app template requires --output-path in unattended mode', async () => {
    const {exitCode, stderr} = await runCli({
      args: ['init', '-y', '--template', 'app-quickstart'],
      env: noAuth,
    })
    expect(exitCode).toBe(1)
    expect(stderr).toContain('`--output-path` must be specified')
  })

  test('1.10 app template requires --organization in unattended mode', async () => {
    const {exitCode, stderr} = await runCli({
      args: ['init', '-y', '--template', 'app-quickstart', '--output-path', '/tmp/out'],
      env: noAuth,
    })
    expect(exitCode).toBe(1)
    expect(stderr).toContain('--organization flag is required for app templates')
  })

  test('1.11 --env filename must start with .env', async () => {
    const {exitCode, stderr} = await runCli({
      args: ['init', '--env', 'notdotenv'],
      env: noAuth,
    })
    expect(exitCode).toBe(2)
    expect(stderr).toContain('must start with `.env`')
  })

  test('1.12 unattended without auth exits with login error', async () => {
    const {exitCode, stderr} = await runCli({
      args: ['init', '-y', '--project', 'abc123', '--dataset', 'prod', '--output-path', '/tmp/out'],
      env: {SANITY_AUTH_TOKEN: ''},
    })
    expect(exitCode).toBe(1)
    expect(stderr).toContain('Must be logged in')
  })
})
