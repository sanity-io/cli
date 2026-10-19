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
    query: {includeChildren: 'true', limit: '500'},
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
    mockApi({
      apiVersion: TOKENS_API_VERSION,
      uri: '/access/organization/org-1/robots/token-2',
    }).reply(200, tokens[1])
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
})
