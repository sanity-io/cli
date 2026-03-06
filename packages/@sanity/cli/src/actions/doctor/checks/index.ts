import {type DoctorCheck} from '../types.js'
import {cliInstallationCheck} from './cliInstallation.js'

/**
 * Map of available doctor checks, keyed by facet name.
 * Runs in the order of declaration, so the most "important" checks should be listed first.
 *
 * @internal
 */
export const doctorChecks = {
  cli: cliInstallationCheck,
} satisfies Record<string, DoctorCheck>

export type DoctorCheckName = keyof typeof doctorChecks

/**
 * List of keys for known checks, used for validation
 *
 * @internal
 */
export const KNOWN_CHECKS: DoctorCheckName[] = Object.keys(doctorChecks) as DoctorCheckName[]
