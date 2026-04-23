import {existsSync, writeFileSync} from 'node:fs'

import {createTmpDir} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test} from 'vitest'

import {getE2EProjectId, runCli} from '../../helpers/runCli.js'

const projectId = getE2EProjectId()

describe('sanity init - studio (interactive)', {timeout: 120_000}, () => {
  let tmp: Awaited<ReturnType<typeof createTmpDir>>

  beforeEach(async () => {
    tmp = await createTmpDir({useSystemTmp: true})
  })

  afterEach(async () => {
    await tmp.cleanup()
  })

  test('triggers login prompt without auth token', async () => {
    const session = await runCli({
      args: ['init'],
      env: {SANITY_AUTH_TOKEN: ''},
      interactive: true,
    })

    await session.waitForText(/log in|create.*account|provider/i)

    session.kill()
  })

  test('Ctrl+C aborts cleanly', async () => {
    const session = await runCli({
      args: ['init'],
      interactive: true,
    })

    await session.waitForText(/Select project|Create.*project/i)
    session.sendControl('c')

    const exitCode = await session.waitForExit()
    expect(exitCode).toBe(130)
  })

  test('produces working studio when flags bypass prompts', async () => {
    const session = await runCli({
      args: [
        'init',
        '--project',
        projectId,
        '--dataset',
        'production',
        '--output-path',
        tmp.path,
        '--template',
        'clean',
        '--typescript',
        '--package-manager',
        'pnpm',
        '--no-mcp',
        '--no-git',
      ],
      interactive: true,
    })

    const exitCode = await session.waitForExit(90_000)
    expect(exitCode).toBe(0)

    expect(existsSync(`${tmp.path}/sanity.config.ts`)).toBe(true)
    expect(existsSync(`${tmp.path}/sanity.cli.ts`)).toBe(true)
    expect(existsSync(`${tmp.path}/package.json`)).toBe(true)

    const output = session.getOutput()
    expect(output).toMatch(/sanity docs|sanity manage|sanity help/i)
    expect(output).not.toMatch(/Select project template/i)
    expect(output).not.toMatch(/Do you want to use TypeScript/i)
    expect(output).not.toMatch(/Select.*package manager/i)
  })

  test('walks through template, TypeScript, and package manager prompts', async () => {
    const session = await runCli({
      args: [
        'init',
        '--project',
        projectId,
        '--dataset',
        'production',
        '--output-path',
        tmp.path,
        '--no-mcp',
        '--no-git',
      ],
      interactive: true,
    })

    await session.waitForText(/Select project template/i)
    session.sendKey('Enter')

    await session.waitForText(/Do you want to use TypeScript/i)
    session.sendKey('Enter')

    await session.waitForText(/package manager|npm|yarn|pnpm/i)
    session.sendKey('Enter')

    const exitCode = await session.waitForExit(90_000)
    expect(exitCode).toBe(0)

    expect(existsSync(`${tmp.path}/sanity.config.ts`)).toBe(true)
    expect(existsSync(`${tmp.path}/sanity.cli.ts`)).toBe(true)
    expect(existsSync(`${tmp.path}/package.json`)).toBe(true)
    expect(existsSync(`${tmp.path}/node_modules`)).toBe(true)
  })

  test('auto-detects package manager from existing lockfile', async () => {
    writeFileSync(`${tmp.path}/pnpm-lock.yaml`, 'lockfileVersion: 5.4\n')

    const session = await runCli({
      args: [
        'init',
        '--project',
        projectId,
        '--dataset',
        'production',
        '--output-path',
        tmp.path,
        '--template',
        'clean',
        '--typescript',
        '--no-mcp',
        '--no-git',
      ],
      interactive: true,
    })

    const exitCode = await session.waitForExit(90_000)
    expect(exitCode).toBe(0)

    const output = session.getOutput()
    expect(output).not.toMatch(/Select.*package manager/i)
    expect(existsSync(`${tmp.path}/sanity.config.ts`)).toBe(true)
  })

  test.each([
    {
      answer: 'y\n',
      name: 'imports sample data when accepted',
      postAnswerWait: /import/i,
    },
    {
      answer: 'n\n',
      name: 'skips import when declined',
      postAnswerWait: /installing|Success/i,
    },
  ])('$name', async ({answer, postAnswerWait}) => {
    const session = await runCli({
      args: [
        'init',
        '--project',
        projectId,
        '--dataset',
        'production',
        '--output-path',
        tmp.path,
        '--template',
        'moviedb',
        '--no-mcp',
        '--package-manager',
        'pnpm',
        '--no-git',
      ],
      interactive: true,
    })

    await session.waitForText(/TypeScript/i)
    session.sendKey('Enter')

    await session.waitForText(/sampling.*movies|dataset on the hosted backend/i)
    session.write(answer)

    await session.waitForText(postAnswerWait, {timeout: 90_000})

    const exitCode = await session.waitForExit(90_000)
    expect(exitCode).toBe(0)
  })
})
