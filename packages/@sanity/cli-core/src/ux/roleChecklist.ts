import {styleText} from 'node:util'

import {
  createPrompt,
  isDownKey,
  isEnterKey,
  isSpaceKey,
  isUpKey,
  makeTheme,
  useEffect,
  useKeypress,
  usePagination,
  usePrefix,
  useRef,
  useState,
} from '@inquirer/core'

import {getErrorMessage} from '../errors/getErrorMessage.js'

type ChecklistRole = {title: string; value: string}

export type ChecklistItem = {
  checked?: boolean
  loadRoles?: () => Promise<ChecklistRole[]>
  name: string
  role?: string
  roles?: ChecklistRole[]
  suffix?: string
  value: string
}

type ChecklistAnswer = {role?: string; value: string}

type RoleChecklistConfig = {
  message: string
  pageSize?: number
  sections: {items: ChecklistItem[]; title: string}[]
}

type Row = ChecklistItem & {
  checked: boolean
  section: string
}

type PromptContext = {
  input?: NodeJS.ReadableStream
  output?: NodeJS.WritableStream
}

const ROW_PREFIX_WIDTH = 4
const ROLE_GAP = 4
const MIN_LABEL_WIDTH = 12

function formatLabel({name, suffix}: ChecklistItem): string {
  return suffix ? `${name} ${suffix}` : name
}

function formatRoleCell(title: string): string {
  return `‹ ${title} ›`
}

export function getLabelWidth(items: ChecklistItem[], terminalWidth: number): number {
  const longestLabel = Math.max(0, ...items.map((item) => formatLabel(item).length))
  const longestRoleCell = Math.max(
    0,
    ...items.flatMap((item) => (item.roles ?? []).map(({title}) => formatRoleCell(title).length)),
  )
  const available = terminalWidth - ROW_PREFIX_WIDTH - ROLE_GAP - longestRoleCell
  return Math.max(Math.min(longestLabel, available), MIN_LABEL_WIDTH)
}

export function fitLabel(item: ChecklistItem, width: number): string {
  const label = formatLabel(item)
  if (label.length <= width) return label.padEnd(width)

  const suffix = item.suffix ? ` ${item.suffix}` : ''
  const name = item.name.slice(0, Math.max(width - suffix.length - 1, 0)).trimEnd()
  return `${name}…${suffix}`.padEnd(width)
}

function renderRow(row: Row, isActive: boolean, labelWidth: number): string {
  const cursor = isActive ? '❯' : ' '
  const box = row.checked ? styleText('green', '◉') : '◯'
  const roleTitle = row.roles?.find(({value}) => value === row.role)?.title ?? row.role
  const roleCell = roleTitle ? formatRoleCell(roleTitle) : ''
  const line = `${cursor} ${box} ${fitLabel(row, labelWidth)}${' '.repeat(ROLE_GAP)}${
    row.checked ? roleCell : styleText('dim', roleCell)
  }`.trimEnd()
  return isActive ? styleText('cyan', line) : line
}

function cycleRole(row: Row, offset: number): Row {
  const roles = row.roles ?? []
  const index = roles.findIndex(({value}) => value === row.role)
  const next = roles[(index + offset + roles.length) % roles.length]
  return next ? {...row, role: next.value} : row
}

function findSubmitError(rows: Row[], isLoading: (row: Row) => boolean): string | undefined {
  const selected = rows.filter((row) => row.checked)
  if (selected.length === 0) return 'Select at least one option'

  const loading = selected.find((row) => isLoading(row))
  if (loading) return `Still loading roles for ${loading.name}. Press ⏎ again in a moment`

  const unloaded = selected.find((row) => row.loadRoles)
  if (unloaded) return `Couldn't load roles for ${unloaded.name}. Press ←→ to retry, or uncheck it`

  const roleless = selected.find((row) => row.roles?.length === 0)
  if (roleless) return `${roleless.name} has no roles that tokens can use. Uncheck it to continue`

  return undefined
}

function renderHelp(): string {
  return [
    ['↑↓', 'navigate'],
    ['space', 'toggle'],
    ['←→', 'role'],
    ['type', 'to filter'],
    ['⏎', 'submit'],
  ]
    .map(([key, action]) => `${styleText('bold', key)} ${styleText('dim', action)}`)
    .join(styleText('dim', ' • '))
}

export const roleChecklist: (
  config: RoleChecklistConfig,
  context?: PromptContext,
) => Promise<ChecklistAnswer[]> = createPrompt<ChecklistAnswer[], RoleChecklistConfig>(
  (config, done) => {
    const {message, pageSize = 15} = config
    const theme = makeTheme({})
    const [status, setStatus] = useState<'done' | 'idle'>('idle')
    const prefix = usePrefix({status, theme})
    const [rows, setRows] = useState<Row[]>(() =>
      config.sections.flatMap(({items, title}) =>
        items.map((item) => ({
          ...item,
          checked: item.checked ?? false,
          section: title,
        })),
      ),
    )
    const [filter, setFilter] = useState('')
    const [active, setActive] = useState(0)
    const [error, setError] = useState<string>()
    const pendingLoads = useRef(new Map<string, Promise<void>>())
    const settled = useRef(false)

    const query = filter.toLowerCase()
    const visible = rows.filter((row) => formatLabel(row).toLowerCase().includes(query))
    const current = visible[active]

    const updateRow = (value: string, update: (row: Row) => Row) =>
      setRows((all) => all.map((row) => (row.value === value ? update(row) : row)))

    const fetchRoles = async (value: string, load: () => Promise<ChecklistRole[]>) => {
      try {
        const roles = await load()
        if (settled.current) return
        updateRow(value, (row) => ({
          ...row,
          loadRoles: undefined,
          role: roles.some((role) => role.value === row.role) ? row.role : roles[0]?.value,
          roles,
        }))
      } catch (err) {
        if (!settled.current) setError(getErrorMessage(err))
      } finally {
        pendingLoads.current.delete(value)
      }
    }

    const loadRoles = (row: Row): Promise<void> => {
      if (!row.loadRoles) return Promise.resolve()

      const pending = pendingLoads.current.get(row.value) ?? fetchRoles(row.value, row.loadRoles)
      pendingLoads.current.set(row.value, pending)
      return pending
    }

    useEffect(() => {
      for (const row of rows.filter(({checked}) => checked)) {
        void loadRoles(row)
      }
    }, [])

    useKeypress(async (key, rl) => {
      if (isEnterKey(key)) {
        const submitError = findSubmitError(rows, (row) => pendingLoads.current.has(row.value))
        if (submitError) {
          setError(submitError)
          return
        }
        settled.current = true
        setStatus('done')
        done(rows.filter((row) => row.checked).map(({role, value}) => ({role, value})))
        return
      }

      setError(undefined)

      if (isUpKey(key) || isDownKey(key)) {
        const next = active + (isUpKey(key) ? -1 : 1)
        setActive(Math.max(Math.min(next, visible.length - 1), 0))
        return
      }

      const isRoleKey = key.name === 'left' || key.name === 'right'
      if (!isSpaceKey(key) && !isRoleKey) {
        setFilter(rl.line)
        setActive(0)
        return
      }

      // readline has already applied the space or arrow to its line buffer, so restore the filter
      rl.clearLine(0)
      rl.write(filter)
      if (!current) return

      if (isSpaceKey(key)) {
        const checked = !current.checked
        updateRow(current.value, (row) => ({...row, checked}))
        if (checked) await loadRoles(current)
        return
      }

      const offset = key.name === 'right' ? 1 : -1
      if (current.loadRoles) {
        await loadRoles(current)
        if (settled.current) return
      }
      updateRow(current.value, (row) => cycleRole(row, offset))
    })

    const labelWidth = getLabelWidth(rows, process.stdout.columns || 80)
    const entries: (Row | string)[] = visible.flatMap((row, index) => {
      if (row.section === visible[index - 1]?.section) return [row]
      const header = styleText('bold', `  ${row.section}`)
      return [index === 0 ? header : `\n${header}`, row]
    })
    const page = usePagination({
      active: current ? entries.indexOf(current) : 0,
      items: entries.length > 0 ? entries : [styleText('dim', '  No matches')],
      loop: false,
      pageSize,
      renderItem: ({isActive, item}) =>
        typeof item === 'string' ? item : renderRow(item, isActive, labelWidth),
    })

    const header = [prefix, theme.style.message(message, status)]
    if (status === 'done') {
      const answer = rows.filter((row) => row.checked).map(({name}) => name)
      return [...header, theme.style.answer(answer.join(', '))].join(' ')
    }

    const body = [page, ' ', error ? theme.style.error(error) : '', renderHelp()]
    return [[...header, filter].join(' '), body.filter(Boolean).join('\n')]
  },
)
