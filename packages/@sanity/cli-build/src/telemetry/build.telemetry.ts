import {defineTrace} from '@sanity/telemetry'

export const StudioBuildTrace = defineTrace<{outputSize: number}>({
  description: 'A Studio build completed',
  name: 'Studio Build Completed',
  version: 0,
})

export const AppBuildTrace = defineTrace<{outputSize: number}>({
  description: 'An App build completed',
  name: 'App Build Completed',
  version: 0,
})
