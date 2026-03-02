import {afterEach, describe, expect, test, vi} from 'vitest'

import {NonInteractiveError} from '../../errors/NonInteractiveError.js'

const mockIsInteractive = vi.hoisted(() => vi.fn())

const mockConfirm = vi.hoisted(() => vi.fn())
const mockSelect = vi.hoisted(() => vi.fn())
const mockInput = vi.hoisted(() => vi.fn())
const mockCheckbox = vi.hoisted(() => vi.fn())
const mockPassword = vi.hoisted(() => vi.fn())
const mockEditor = vi.hoisted(() => vi.fn())
const mockNumber = vi.hoisted(() => vi.fn())
const mockExpand = vi.hoisted(() => vi.fn())
const mockRawlist = vi.hoisted(() => vi.fn())
const mockSearch = vi.hoisted(() => vi.fn())

vi.mock('../../util/isInteractive.js', () => ({
  isInteractive: mockIsInteractive,
}))

vi.mock('@inquirer/prompts', () => ({
  checkbox: mockCheckbox,
  confirm: mockConfirm,
  editor: mockEditor,
  expand: mockExpand,
  input: mockInput,
  number: mockNumber,
  password: mockPassword,
  rawlist: mockRawlist,
  search: mockSearch,
  select: mockSelect,
  Separator: class Separator {},
}))

describe('safe prompt wrappers', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  const promptCases = [
    {mock: mockConfirm, name: 'confirm'},
    {mock: mockSelect, name: 'select'},
    {mock: mockInput, name: 'input'},
    {mock: mockCheckbox, name: 'checkbox'},
    {mock: mockPassword, name: 'password'},
    {mock: mockEditor, name: 'editor'},
    {mock: mockNumber, name: 'number'},
    {mock: mockExpand, name: 'expand'},
    {mock: mockRawlist, name: 'rawlist'},
    {mock: mockSearch, name: 'search'},
  ] as const

  describe('in interactive mode', () => {
    test.each(promptCases)('$name passes through to @inquirer/prompts', async ({mock, name}) => {
      mockIsInteractive.mockReturnValue(true)
      mock.mockResolvedValue('result')

      // Dynamic import to get the wrappers (after mocks are set up)
      const prompts = await import('../prompts.js')
      const wrapper = prompts[name] as (...args: unknown[]) => unknown
      const result = await wrapper({message: 'test'})

      expect(result).toBe('result')
      expect(mock).toHaveBeenCalledOnce()
    })
  })

  describe('in non-interactive mode', () => {
    test.each(promptCases)('$name throws NonInteractiveError', async ({mock, name}) => {
      mockIsInteractive.mockReturnValue(false)

      const prompts = await import('../prompts.js')
      const wrapper = prompts[name] as (...args: unknown[]) => unknown

      expect(() => wrapper({message: 'test'})).toThrow(NonInteractiveError)
      expect(mock).not.toHaveBeenCalled()
    })

    test.each(promptCases)('$name error message includes the prompt name', async ({name}) => {
      mockIsInteractive.mockReturnValue(false)

      const prompts = await import('../prompts.js')
      const wrapper = prompts[name] as (...args: unknown[]) => unknown

      expect(() => wrapper({message: 'test'})).toThrow(`Cannot run "${name}" prompt`)
    })
  })
})
