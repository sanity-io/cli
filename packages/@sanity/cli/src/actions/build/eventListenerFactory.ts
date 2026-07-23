import {styleText} from 'node:util'

import {Output} from '@sanity/cli-core'
import {select} from '@sanity/cli-core/ux'

/**
 * Creates check dependency event handlers that are shared between buildStudio and startStudioDevServer.
 */
export function checkDependenciesEventListenerFactory(output: Output) {
  return {
    onIncompatibleDeclaredStyledComponentsVersionRange({message}: {message: string}) {
      output.warn(message)
    },
    onIncompatibleInstalledStyledComponentsVersionRange({message}: {message: string}) {
      output.warn(message)
    },
    onInvalidStyledComponentsVersionRange({message}: {message: string}) {
      output.error(message, {exit: 1})
    },
    onNoDeclaredStyledComponentsVersion({message}: {message: string}) {
      output.error(message, {exit: 1})
    },
    onNoInstalledSanityVersion({message}: {message: string}) {
      output.error(message, {exit: 1})
    },
    onNoInstalledStyledComponentsVersion({message}: {message: string}) {
      output.error(message, {exit: 1})
    },
  }
}

/**
 * Creates pre-release event handlers that are shared between buildApp and buildStudio.
 */
export function preReleaseEventListenerFactory(output: Output) {
  return {
    async onPreReleaseInInteractiveAutoUpdate({prereleaseMessage}: {prereleaseMessage: string}) {
      const choice = await select({
        choices: [
          {
            name: 'Disable auto-updates for this build and continue',
            value: 'disable-auto-updates',
          },
          {name: 'Cancel build', value: 'cancel'},
        ],
        default: 'disable-auto-updates',
        message: styleText('yellow', prereleaseMessage),
      })

      if (choice === 'cancel') {
        output.error('Declined to continue with build', {exit: 1})
        return
      }

      output.warn('Auto-updates disabled for this build')
    },
    onPreReleaseInNonInteractiveAutoUpdate({message}: {message: string}) {
      output.error(message, {exit: 1})
    },
  }
}
