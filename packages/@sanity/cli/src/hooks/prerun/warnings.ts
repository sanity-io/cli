import {type Hook} from '@oclif/core'

import {warnOnNonProductionEnvironment} from '../../util/warnOnNonProductionEnvironment.js'

export const warnings: Hook.Prerun = async function () {
  warnOnNonProductionEnvironment()
}
