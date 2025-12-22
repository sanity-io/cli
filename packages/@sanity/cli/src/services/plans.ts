import {getGlobalCliClient} from '@sanity/cli-core'

import {INIT_API_VERSION} from '../actions/init/constants.js'

export async function getPlanId(intendedPlanId: string) {
  const client = await getGlobalCliClient({
    apiVersion: INIT_API_VERSION,
    requireUser: false,
  })

  const response = await client.request<{id: string}[]>({uri: `plans/${intendedPlanId}`})
  if (Array.isArray(response) && response.length > 0) {
    const planId = response[0]?.id
    if (!planId) {
      throw new Error(`Unable to find a plan with id ${intendedPlanId}`)
    }

    return response[0].id
  }
}

export async function getPlanIdFromCoupon(couponCode: string) {
  const client = await getGlobalCliClient({
    apiVersion: INIT_API_VERSION,
    requireUser: false,
  })

  const response = await client.request<{id: string}[]>({
    uri: `plans/coupon/${encodeURIComponent(couponCode)}`,
  })

  if (!Array.isArray(response) || response.length === 0) {
    throw new Error(`No plans found for coupon code "${couponCode}"`)
  }

  const planId = response[0].id
  if (!planId) {
    throw new Error('Unable to find a plan from coupon code')
  }

  return planId
}
