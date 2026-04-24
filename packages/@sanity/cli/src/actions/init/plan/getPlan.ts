import {type TelemetryUserProperties} from '@sanity/cli-core'
import {type TelemetryTrace} from '@sanity/telemetry'

import {type InitStepResult} from '../../../telemetry/init.telemetry.js'
import {type InitContext, type InitOptions} from '../types.js'
import {verifyCoupon} from './verifyCoupon.js'
import {verifyPlan} from './verifyPlan.js'

export async function getPlan(
  options: InitOptions,
  output: InitContext['output'],
  trace: TelemetryTrace<TelemetryUserProperties, InitStepResult>,
): Promise<string | undefined> {
  const intendedPlan = options.projectPlan
  const intendedCoupon = options.coupon

  if (intendedCoupon) {
    return verifyCoupon(intendedCoupon, options.unattended, output, trace)
  } else if (intendedPlan) {
    return verifyPlan(intendedPlan, options.unattended, output, trace)
  } else {
    return undefined
  }
}
