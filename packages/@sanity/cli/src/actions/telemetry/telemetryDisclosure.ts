import {ux} from '@oclif/core'
import {getUserConfig, isCi} from '@sanity/cli-core'
import boxen from 'boxen'
import chalk from 'chalk'

import {telemetryDebug} from './telemetryDebug.js'
import {telemetryLearnMoreMessage} from './telemetryLearnMoreMessage.js'

const TELEMETRY_DISCLOSED_CONFIG_KEY = 'telemetryDisclosed'

export function telemetryDisclosure(): void {
  const userConfig = getUserConfig()

  if (isCi) {
    telemetryDebug('CI environment detected, skipping telemetry disclosure')
    return
  }

  if (userConfig.get(TELEMETRY_DISCLOSED_CONFIG_KEY)) {
    telemetryDebug('Telemetry disclosure has already been shown')
    return
  }

  // Print to stderr to prevent garbling command output
  ux.stderr(
    boxen(
      `The Sanity CLI now collects telemetry data on general usage and errors.
This helps us improve Sanity and prioritize features.

To opt in/out, run ${chalk.cyan('npx sanity telemetry enable/disable')}.

${telemetryLearnMoreMessage('unset')}`,
      {
        borderColor: 'yellow',
        borderStyle: 'round',
        margin: 1,
        padding: 1,
      },
    ),
  )

  userConfig.set(TELEMETRY_DISCLOSED_CONFIG_KEY, Date.now())
}
