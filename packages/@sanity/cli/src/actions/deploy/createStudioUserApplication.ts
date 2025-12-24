import {input} from '@sanity/cli-core/ux'
import {CLIError} from '@oclif/core/errors'

import {createUserApplication, type UserApplication} from '../../services/userApplications.js'
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

export async function createStudioUserApplication(projectId: string) {
  const {promise, resolve} = promiseWithResolvers<UserApplication>()

  await input({
    message: 'Studio hostname (<value>.sanity.studio):',
    // if a string is returned here, it is relayed to the user and prompt allows
    // the user to try again until this function returns true
    validate: async (inp: string) => {
      const appHost = inp.replace(/\.sanity\.studio$/i, '')
      try {
        const response = await createUserApplication({
          appType: 'studio',
          body: {
            appHost,
            type: 'studio',
            urlType: 'internal',
          },
          projectId,
        })
        resolve(response)
        return true
      } catch (e) {
        // if the name is taken, it should return a 409 so we relay to the user
        if ([402, 409].includes(e?.statusCode)) {
          return e?.response?.body?.message || 'Bad request' // just in case
        }

        deployDebug('Error creating user application', e)
        // otherwise, it's a fatal error
        throw new CLIError('Error creating user application', {exit: 1})
      }
    },
  })

  return await promise
}
