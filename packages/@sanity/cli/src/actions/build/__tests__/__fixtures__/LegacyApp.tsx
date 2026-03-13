/* eslint-disable unicorn/no-abusive-eslint-disable */
// This is a test fixture file for detectLegacySanityApp tests
// It demonstrates the legacy pattern that should be detected
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck - This is a test fixture file
/* eslint-disable */
import {type SanityConfig} from '@sanity/sdk'
import {SanityApp} from '@sanity/sdk-react'

function LegacyApp() {
  const sanityConfigs: SanityConfig[] = [
    {
      dataset: 'test-dataset',
      projectId: 'test-project',
    },
  ]

  return (
    <div>
      <SanityApp config={sanityConfigs} fallback={<div>Loading...</div>}>
        <div>Legacy App Content</div>
      </SanityApp>
    </div>
  )
}

export default LegacyApp
