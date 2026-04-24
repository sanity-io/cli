import {type TelemetryUserProperties} from '@sanity/cli-core'
import {confirm} from '@sanity/cli-core/ux'
import {isHttpError} from '@sanity/client'
import {type TelemetryTrace} from '@sanity/telemetry'

import {getPlanId} from '../../../services/plans.js'
import {type InitStepResult} from '../../../telemetry/init.telemetry.js'
import {InitError} from '../initError.js'
import {type InitContext} from '../types.js'

export async function verifyPlan(
  intendedPlan: string,
  unattended: boolean,
  output: InitContext['output'],
  trace: TelemetryTrace<TelemetryUserProperties, InitStepResult>,
): Promise<string | undefined> {
  try {
    const planId = await getPlanId(intendedPlan)
    return planId
  } catch (err: unknown) {
    if (!isHttpError(err) || err.statusCode !== 404) {
      const message = err instanceof Error ? err.message : `${err}`
      throw new InitError(`Unable to validate plan, please try again later:\n\n${message}`, 1)
    }

    const useDefaultPlan =
      unattended ||
      (await confirm({
        default: true,
        message: `Project plan "${intendedPlan}" does not exist, use default plan instead?`,
      }))

    if (unattended) {
      output.warn(`Project plan "${intendedPlan}" does not exist - using default plan`)
    }

    trace.log({
      planId: intendedPlan,
      selectedOption: useDefaultPlan ? 'yes' : 'no',
      step: 'useDefaultPlanId',
    })

    if (useDefaultPlan) {
      output.log('Using default plan.')
      return undefined
    }

    throw new InitError(`Plan id "${intendedPlan}" does not exist`, 1)
  }
}
