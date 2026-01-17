import {type Hook} from '@oclif/core'

import {warnOnNonProductionEnvironment} from '../../util/warnOnNonProductionEnvironment.js'
import {warnOnUnsupportedRuntime} from '../../util/warnOnUnsupportedRuntime.js'

export const warnings: Hook.Prerun = async function ({config}) {
  warnOnUnsupportedRuntime(config.pjson)
  warnOnNonProductionEnvironment()
}
