import {type UserOptions} from '@module-federation/runtime/types'

type HostShared = NonNullable<UserOptions['shared']>

/** Runs the generated `virtual:sanity/federation-host` module with its imports bound to `modules`. */
export function evaluateHostModule(
  code: string,
  modules: Record<string, unknown> = {},
): HostShared {
  const body = code
    .replaceAll(/^import \* as (\w+) from ("[^"]+")$/gm, 'const $1 = modules[$2]')
    .replace(/^export /m, '')
  return new Function('modules', `${body}\nreturn shared`)(modules) as HostShared
}
