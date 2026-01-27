import {type ConsentStatus, type TelemetryLogger} from '@sanity/telemetry'

export type ConsentInformation =
  | {
      reason: 'fetchError' | 'unauthenticated'
      status: Extract<ConsentStatus, 'undetermined'>
    }
  | {
      reason?: 'localOverride'
      status: Extract<ConsentStatus, 'denied'>
    }
  | {
      reason?: never
      status: Extract<ConsentStatus, 'granted'>
    }
  | {
      reason?: never
      status: Extract<ConsentStatus, 'unset'>
    }

/**
 * @public
 */
export interface TelemetryUserProperties {
  cliVersion: string
  cpuArchitecture: string
  machinePlatform: string
  runtime: string
  runtimeVersion: string

  dataset?: string
  projectId?: string
}

/**
 * @public
 */
export type CLITelemetryStore = TelemetryLogger<TelemetryUserProperties>
