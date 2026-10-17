import {PassThrough} from 'node:stream'
import {stripVTControlCharacters} from 'node:util'

import {mockApi, testCommand} from '@sanity/cli-test'
import {cleanAll, pendingMocks} from 'nock'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {TOKENS_API_VERSION} from '../../../actions/tokens/constants.js'
import {type Robot} from '../../../actions/tokens/types.js'
import {DeleteTokensCommand} from '../delete.js'

const prompts = vi.hoisted(() => ({
  context: undefined as {input: PassThrough; output: PassThrough; signal: AbortSignal} | undefined,
  opened: [] as string[],
  prepareOutput: () => {},
}))

vi.mock('@sanity/cli-core/ux', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core/ux')>()
  const select: typeof actual.select = (config) => {
    prompts.prepareOutput()
    prompts.opened.push('select')
    return actual.select(config, prompts.context)
  }
  const confirm: typeof actual.confirm = (config) => {
    prompts.prepareOutput()
    prompts.opened.push('confirm')
    return actual.confirm(config, prompts.context)
  }
  return {...actual, confirm, select}
})

const ENTER = '\r'
const DOWN = '\u001B[B'
const CTRL_C = '\u0003'
const mocks = {
  cliConfig: {api: {projectId: 'project-1'}},
  isInteractive: true,
  token: 'test-token',
}

const tokens: Robot[] = ['token-1', 'token-2'].map((id) => ({
  createdAt: '2026-10-17T00:00:00Z',
  id,
  label: 'Same label',
  managedBy: {resourceId: 'org-1', resourceType: 'organization'},
  memberships: [{resourceId: 'project-1', resourceType: 'project', roleNames: ['viewer']}],
}))

let controller: AbortController
let screen: string
let outputs: PassThrough[]
let input: PassThrough
let running: ReturnType<typeof testCommand> | undefined
const stdinTty = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY')

beforeEach(() => {
  vi.stubEnv('CI', undefined)
  vi.stubEnv('TERM', 'xterm')
  Object.defineProperty(process.stdin, 'isTTY', {configurable: true, value: true})
  controller = new AbortController()
  input = new PassThrough()
  prompts.context = undefined
  screen = ''
  outputs = []
  prompts.prepareOutput = () => {
    const output = new PassThrough()
    outputs.push(output)
    output.on('data', (chunk: Buffer) => {
      screen += stripVTControlCharacters(chunk.toString())
    })
    prompts.context = {input, output, signal: controller.signal}
  }
  prompts.opened = []
})

afterEach(async () => {
  controller.abort()
  await running
  running = undefined
  input.destroy()
  for (const output of outputs) output.destroy()
  vi.unstubAllEnvs()
  if (stdinTty) Object.defineProperty(process.stdin, 'isTTY', stdinTty)
  else Reflect.deleteProperty(process.stdin, 'isTTY')
  const pending = pendingMocks()
  cleanAll()
  expect(pending).toEqual([])
})

function listPage() {
  return mockApi({
    apiVersion: TOKENS_API_VERSION,
    query: {includeChildren: 'true'},
    uri: '/access/organization/org-1/robots',
  })
}

function start(args: string[] = []) {
  running = testCommand(DeleteTokensCommand, ['--organization', 'org-1', ...args], {mocks})
  return running
}

async function waitForPrompt(text: string) {
  await vi.waitFor(() => expect(screen).toContain(text))
}

function press(keys: string) {
  prompts.context!.input.write(keys)
}

describe('tokens delete with real prompts', () => {
  test('buffered arrow and Enter select the second of two identically named tokens', async () => {
    listPage().reply(200, {data: tokens, nextCursor: null})
    const deletion = mockApi({
      apiVersion: TOKENS_API_VERSION,
      method: 'delete',
      uri: '/access/organization/org-1/robots/token-2',
    }).reply(204)
    const result = start()
    await waitForPrompt('Select token to delete:')
    expect(screen).toContain('[token-1]')
    expect(screen).toContain('[token-2]')
    press(DOWN + ENTER)
    await waitForPrompt('Delete API token "token-2"')
    expect(deletion.isDone()).toBe(false)
    press('y' + ENTER)
    expect((await result).stdout).toBe('API token deleted\n')
    expect(deletion.isDone()).toBe(true)
    expect(prompts.opened).toEqual(['select', 'confirm'])
  })

  test('repeated Enter leaves every token untouched', async () => {
    listPage().reply(200, {data: tokens, nextCursor: null})
    const result = start()
    await waitForPrompt('Select token to delete:')
    press(ENTER + ENTER)
    await waitForPrompt('Delete API token "token-1"')
    press(ENTER)
    const {error, stdout} = await result
    expect(error?.oclif?.exit).toBe(3)
    expect(stdout).toBe('API token not deleted\n')
  })

  test.each(['select', 'confirm'])('Ctrl+C at %s leaves every token untouched', async (stage) => {
    listPage().reply(200, {data: tokens, nextCursor: null})
    const result = start()
    await waitForPrompt('Select token to delete:')
    if (stage === 'confirm') {
      press(ENTER)
      await waitForPrompt('Delete API token "token-1"')
    }
    press(CTRL_C)
    const {error, stdout} = await result
    expect(error?.oclif?.exit).toBe(130)
    expect(stdout).not.toContain('API token deleted')
  })

  test('waits for all pages before allowing a selection', async () => {
    const secondPage = Promise.withResolvers<void>()
    listPage().reply(200, {data: [tokens[0]], nextCursor: 'page-2'})
    let requestedSecondPage = false
    mockApi({
      apiVersion: TOKENS_API_VERSION,
      query: {includeChildren: 'true', nextCursor: 'page-2'},
      uri: '/access/organization/org-1/robots',
    }).reply(async () => {
      requestedSecondPage = true
      await secondPage.promise
      return [200, {data: [tokens[1]], nextCursor: null}]
    })
    const result = start()
    try {
      await vi.waitFor(() => expect(requestedSecondPage).toBe(true))
      expect(prompts.opened).toEqual([])
    } finally {
      secondPage.resolve()
    }
    await waitForPrompt('[token-2]')
    press(DOWN + ENTER)
    await waitForPrompt('Delete API token "token-2"')
    press(ENTER)
    expect((await result).error?.oclif?.exit).toBe(3)
  })

  test('a failed later page never opens a picker with partial results', async () => {
    listPage().reply(200, {data: [tokens[0]], nextCursor: 'page-2'})
    mockApi({
      apiVersion: TOKENS_API_VERSION,
      query: {includeChildren: 'true', nextCursor: 'page-2'},
      uri: '/access/organization/org-1/robots',
    }).reply(403, {message: 'Forbidden'})
    const {error} = await start()
    expect(error?.oclif?.exit).toBe(1)
    expect(prompts.opened).toEqual([])
  })

  test('a token removed after selection fails without deleting a replacement', async () => {
    listPage().reply(200, {data: tokens, nextCursor: null})
    mockApi({
      apiVersion: TOKENS_API_VERSION,
      method: 'delete',
      uri: '/access/organization/org-1/robots/token-2',
    }).reply(404, {message: 'Token not found'})
    const result = start()
    await waitForPrompt('Select token to delete:')
    press(DOWN + ENTER)
    await waitForPrompt('Delete API token "token-2"')
    press('y' + ENTER)
    const {error, stdout} = await result
    expect(error?.message).toContain('Token with ID "token-2" not found')
    expect(error?.oclif?.exit).toBe(1)
    expect(stdout).not.toContain('API token deleted')
    expect(prompts.opened).toEqual(['select', 'confirm'])
  })

  test.each([
    {flags: ['--organization', 'org-1'], name: 'organization'},
    {flags: [], name: 'configured project'},
  ])('Enter keeps the non-interactive default of no deletion for $name', async ({flags}) => {
    const result = testCommand(DeleteTokensCommand, ['token-2', ...flags], {mocks})
    running = result
    await waitForPrompt('Delete API token "token-2"')
    press(ENTER)
    expect((await result).error?.oclif?.exit).toBe(3)
    expect(prompts.opened).toEqual(['confirm'])

    const unattended = await testCommand(DeleteTokensCommand, ['token-2', ...flags], {
      mocks: {...mocks, isInteractive: false},
    })
    expect(unattended.error?.oclif?.exit).toBe(2)
    expect(prompts.opened).toEqual(['confirm'])
  })
})
