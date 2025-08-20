import {type Hook} from '@oclif/core'

import {telemetryDebug} from '../../actions/telemetry/telemetryDebug.js'
import {TelemetryStore} from '../../telemetry/TelemetryStore.js'

/**
 * Complete the telemetry trace for the command
 *
 * @internal
 */
export const completeTelemetry: Hook.Postrun = async function () {
  telemetryDebug('Completing command trace')
  const telemetryStore = await TelemetryStore.getInstance()
  telemetryStore._completeCommandTrace()
}
