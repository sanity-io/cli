import ora, {
  type Options,
  type Ora,
  oraPromise,
  type Spinner as OraSpinner,
  type PromiseOptions,
} from 'ora'

import {getCliExecutionContext} from '../executionContext.js'

function silentSpinner(options?: Options | string): Ora {
  const instance = {
    clear: () => instance,
    fail: () => instance,
    frame: () => '',
    info: () => instance,
    isSpinning: false,
    prefixText: typeof options === 'object' ? (options.prefixText ?? '') : '',
    render: () => instance,
    start: () => instance,
    stop: () => instance,
    stopAndPersist: () => instance,
    succeed: () => instance,
    suffixText: typeof options === 'object' ? (options.suffixText ?? '') : '',
    text: typeof options === 'string' ? options : (options?.text ?? ''),
    warn: () => instance,
  }
  return instance as unknown as Ora
}

export function spinner(options?: Options | string): Ora {
  return getCliExecutionContext() ? silentSpinner(options) : ora(options)
}

export function spinnerPromise<T>(
  action: ((instance: Ora) => PromiseLike<T>) | PromiseLike<T>,
  options?: PromiseOptions<T> | string,
): Promise<T> {
  if (!getCliExecutionContext()) return oraPromise(action, options)
  return Promise.resolve(typeof action === 'function' ? action(silentSpinner(options)) : action)
}

export type Spinner = OraSpinner
export type SpinnerInstance = Ora
export type SpinnerOptions = Options
export type SpinnerPromiseOptions<T> = PromiseOptions<T>
