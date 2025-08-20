import {
  
  
  
  type TelemetryLogger as SanityTelemetryLogger,
} from '@sanity/telemetry'

export interface TelemetryOptions {
  env: NodeJS.ProcessEnv

  projectId?: string
}

export interface UserProperties {
  cliVersion?: string
  cpuArchitecture?: string
  dataset?: string
  machinePlatform?: string
  projectId?: string
  runtime?: string
  runtimeVersion?: string
}


export type TelemetryLogger = SanityTelemetryLogger<UserProperties>

export interface TelemetryTrace {
  complete(): void
  error(error: Error): void
  log(data?: unknown): void
  start(): void
}


export {type ConsentStatus} from '@sanity/telemetry'