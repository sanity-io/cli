// Telemetry only. Should be as lean as possible.
// TODO: need to remove OCLIF dependency in the following file
export {
  clearCliTelemetry,
  CLI_TELEMETRY_SYMBOL,
  getCliTelemetry,
  reportCliTraceError,
  setCliTelemetry,
} from '../telemetry/getCliTelemetry.js'
export {getTelemetryBaseInfo} from '../telemetry/getTelemetryBaseInfo.js'
export {noopLogger} from '../telemetry/noopTelemetry.js'
