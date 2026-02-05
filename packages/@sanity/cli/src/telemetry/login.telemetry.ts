import {defineTrace} from '@sanity/telemetry'

interface SelectProviderStep {
  provider: string | undefined
  step: 'selectProvider'
}

interface WaitForTokenStep {
  step: 'waitForToken'
}

type LoginTraceData = SelectProviderStep | WaitForTokenStep

export const LoginTrace = defineTrace<LoginTraceData>({
  description: 'User completed a step in the CLI login flow',
  name: 'CLI Login Step Completed',
  version: 1,
})
