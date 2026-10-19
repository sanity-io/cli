import {stripVTControlCharacters} from 'node:util'

import {encodeStatus, type StatusReport, type StatusState} from 'osc-status'

import {getCliExecutionContext} from '../executionContext.js'

type Status = StatusReport<'blocked'> & {state: Exclude<StatusState, 'clear'>}

const active = new Map<symbol, Status>()
let lastReport = ''

function enabled(): boolean {
  return (
    !getCliExecutionContext() &&
    Boolean(process.stderr.isTTY) &&
    process.env.TERM !== 'dumb' &&
    !('CI' in process.env)
  )
}

function report({state, ...fields}: Status): void {
  // Strip styling and controls, and stay within OSC 7501's 2048-byte message limit
  // even when every character takes four bytes in UTF-8.
  const message =
    fields.message === undefined
      ? undefined
      : [...stripVTControlCharacters(fields.message).replaceAll(/\p{Cc}/gu, ' ')]
          .slice(0, 512)
          .join('')
  const sequence = encodeStatus(state, {app: 'sanity', ...fields, message})
  if (sequence === lastReport) return
  lastReport = sequence
  process.stderr.write(sequence)
}

function restore(): void {
  report([...active.values()].at(-1) ?? {state: 'working'})
}

/** A prompt temporarily takes precedence over the spinner it interrupts. */
export function createTerminalStatus() {
  const id = Symbol()
  return {
    stop() {
      if (enabled() && active.delete(id)) restore()
    },
    update(status: Status) {
      if (!enabled()) return
      active.set(id, status)
      restore()
    },
  }
}

export function finishTerminalStatus(state: 'done' | 'error' | 'idle'): void {
  if (!enabled()) return
  active.clear()
  report({state})
}

/** Observe settlement without replacing Inquirer's cancellable promise. */
export function withPromptStatus<T extends Promise<unknown>>(
  kind: NonNullable<StatusReport<'blocked'>['kind']>,
  message: string,
  prompt: () => T,
): T {
  const result = prompt()
  const status = createTerminalStatus()
  status.update({kind, message, state: 'blocked'})
  void result.then(status.stop, status.stop)
  return result
}
