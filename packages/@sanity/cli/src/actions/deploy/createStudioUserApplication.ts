import {CLIError} from '@oclif/core/errors'
import {input} from '@sanity/cli-core/ux'
import {isHttpError} from '@sanity/client'

import {createUserApplication, type UserApplication} from '../../services/userApplications.js'
import {deployDebug} from './deployDebug.js'
import {normalizeUrl, validateUrl} from './urlUtils.js'

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

interface CreateStudioUserApplicationOptions {
  projectId: string

  urlType?: 'external' | 'internal'
}

export async function createStudioUserApplication(options: CreateStudioUserApplicationOptions) {
  const {projectId, urlType = 'internal'} = options
  const {promise, resolve} = promiseWithResolvers<UserApplication>()

  const isExternal = urlType === 'external'

  await input({
    message: isExternal ? 'Studio URL (https://...):' : 'Studio hostname (<value>.sanity.studio):',
    // if a string is returned here, it is relayed to the user and prompt allows
    // the user to try again until this function returns true
    validate: async (inp: string) => {
      let appHost: string

      if (isExternal) {
        const normalized = normalizeUrl(inp)
        const validation = validateUrl(normalized)
        if (validation !== true) {
          return validation
        }
        appHost = normalized
      } else {
        appHost = inp.replace(/\.sanity\.studio$/i, '')
      }

      try {
        const response = await createUserApplication({
          appType: 'studio',
          body: {
            appHost,
            type: 'studio',
            urlType,
          },
          projectId,
        })
        resolve(response)
        return true
      } catch (e) {
        // if the name is taken, it should return a 409 so we relay to the user
        if (isHttpError(e) && [402, 409].includes(e.statusCode)) {
          const body = e.response.body
          const message =
            typeof body === 'object' &&
            body !== null &&
            'message' in body &&
            typeof body.message === 'string'
              ? body.message
              : 'Bad request'
          return message
        }

        deployDebug('Error creating user application', e)
        // otherwise, it's a fatal error
        throw new CLIError('Error creating user application', {exit: 1})
      }
    },
  })

  return await promise
}
