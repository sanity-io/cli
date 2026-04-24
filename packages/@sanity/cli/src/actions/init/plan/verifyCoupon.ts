import {type TelemetryUserProperties} from '@sanity/cli-core'
import {confirm} from '@sanity/cli-core/ux'
import {isHttpError} from '@sanity/client'
import {type TelemetryTrace} from '@sanity/telemetry'

import {getPlanIdFromCoupon} from '../../../services/plans.js'
import {type InitStepResult} from '../../../telemetry/init.telemetry.js'
import {InitError} from '../initError.js'
import {type InitContext} from '../types.js'

export async function verifyCoupon(
  intendedCoupon: string,
  unattended: boolean,
  output: InitContext['output'],
  trace: TelemetryTrace<TelemetryUserProperties, InitStepResult>,
): Promise<string | undefined> {
  try {
    const planId = await getPlanIdFromCoupon(intendedCoupon)
    output.log(`Coupon "${intendedCoupon}" validated!\n`)
    return planId
  } catch (err: unknown) {
    if (!isHttpError(err) || err.statusCode !== 404) {
      const message = err instanceof Error ? err.message : `${err}`
      throw new InitError(`Unable to validate coupon, please try again later:\n\n${message}`, 1)
    }

    const useDefaultPlan =
      unattended ||
      (await confirm({
        default: true,
        message: `Coupon "${intendedCoupon}" is not available, use default plan instead?`,
      }))

    if (unattended) {
      output.warn(`Coupon "${intendedCoupon}" is not available - using default plan`)
    }

    trace.log({
      coupon: intendedCoupon,
      selectedOption: useDefaultPlan ? 'yes' : 'no',
      step: 'useDefaultPlanCoupon',
    })

    if (useDefaultPlan) {
      output.log('Using default plan.')
      return undefined
    }

    throw new InitError(`Coupon "${intendedCoupon}" does not exist`, 1)
  }
}
