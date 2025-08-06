import {type Hook} from '@oclif/core'

import {telemetryDisclosure} from '../../actions/telemetry/telemetryDisclosure.js'

export const setupTelemetry: Hook.Prerun = async function () {
  // Show telemetry disclosure
  telemetryDisclosure()
}
