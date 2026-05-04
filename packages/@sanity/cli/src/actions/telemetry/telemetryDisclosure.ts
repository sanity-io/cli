// Re-export the standalone version which uses @sanity/cli-core/ux
// instead of oclif's ux.stderr. Same user-facing behavior.
export {telemetryDisclosureStandalone as telemetryDisclosure} from './telemetryDisclosureStandalone.js'
