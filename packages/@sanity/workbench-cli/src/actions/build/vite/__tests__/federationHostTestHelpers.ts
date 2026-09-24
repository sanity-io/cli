interface HostProvider {
  lib: () => unknown
  loaded: boolean
  scope: string[]
  shareConfig: {requiredVersion: string; singleton: boolean; strictVersion: boolean}
  version: string
}

/** Runs the generated `virtual:sanity/federation-host` module with its imports bound to `modules`. */
export function evaluateHostModule(
  code: string,
  modules: Record<string, unknown> = {},
): Record<string, HostProvider> {
  const body = code
    .replaceAll(/^import \* as (\w+) from ("[^"]+")$/gm, 'const $1 = modules[$2]')
    .replace(/^export /m, '')
  return new Function('modules', `${body}\nreturn shared`)(modules) as Record<string, HostProvider>
}
