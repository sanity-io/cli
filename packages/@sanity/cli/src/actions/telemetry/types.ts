import {type ConsentStatus} from '@sanity/telemetry'

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
