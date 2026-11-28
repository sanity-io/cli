export const TELEMETRY_API_VERSION = 'v2026-01-22'
export const TELEMETRY_BATCH_PATH = '/intake/batch'
export const TELEMETRY_STATUS_PATH = '/intake/telemetry-status'

export function getTelemetryTokenDigest(token: string): string {
  return process.getBuiltinModule('node:crypto').createHash('sha256').update(token).digest('hex')
}

export function isTrueish(value: string | undefined): boolean {
  return value?.toLowerCase() === 'true' || Number.parseInt(value ?? '', 10) > 0
}

export function getLocalTelemetryDenial(): 'ci' | 'localOverride' | undefined {
  const {BUILD_NUMBER, CI, CONTINUOUS_INTEGRATION, DO_NOT_TRACK} = process.env
  if (isTrueish(CI) || isTrueish(CONTINUOUS_INTEGRATION) || isTrueish(BUILD_NUMBER)) return 'ci'
  if (isTrueish(DO_NOT_TRACK)) return 'localOverride'
  return undefined
}
