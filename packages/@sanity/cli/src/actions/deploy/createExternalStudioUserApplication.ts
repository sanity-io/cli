import {CLIError} from '@oclif/core/errors'
import {type Output} from '@sanity/cli-core'
import {input, select, Separator} from '@sanity/cli-core/ux'

import {getUserApplications, type UserApplication} from '../../services/userApplications.js'
import {createExternalStudio} from './createExternalStudio.js'
import {deployDebug} from './deployDebug.js'

// TODO: replace with `Promise.withResolvers()` once it lands in node 22
function promiseWithResolvers<T>() {
  let resolve!: (t: T) => void
  let reject!: (err: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return {promise, reject, resolve}
}

export async function createExternalStudioUserApplication(
  projectId: string,
  output: Output,
): Promise<UserApplication> {
  const userApplications = await getUserApplications({appType: 'studio', projectId})
  const externalApps = userApplications?.filter((app) => app.urlType === 'external') ?? []

  if (externalApps.length > 0) {
    const choices = externalApps.map((app) => ({
      name: app.title ?? app.appHost,
      value: app.appHost,
    }))

    const selected = await select({
      choices: [
        {name: 'Create new external studio', value: 'NEW_EXTERNAL'},
        new Separator(),
        ...choices,
      ],
      message: 'Select existing external studio or create new',
    })

    if (selected !== 'NEW_EXTERNAL') {
      return externalApps.find((app) => app.appHost === selected)!
    }
  }

  output.log('Enter the URL to your studio.')

  const {promise, resolve} = promiseWithResolvers<UserApplication>()

  await input({
    message: 'Studio URL (https://...):',
    validate: async (inp: string) => {
      try {
        const response = await createExternalStudio({appHost: inp, projectId})
        resolve(response)
        return true
      } catch (e) {
        if (e instanceof Error) {
          return e.message
        }

        deployDebug('Error registering external studio', e)
        throw new CLIError('Error registering external studio', {exit: 1})
      }
    },
  })

  return await promise
}
