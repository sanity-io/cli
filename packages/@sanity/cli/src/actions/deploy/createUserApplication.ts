import {CLIError} from '@oclif/core/errors'
import {input, spinner} from '@sanity/cli-core/ux'
import {customAlphabet} from 'nanoid'

import {createUserApplication, type UserApplication} from '../../services/userApplications.js'
import {NO_ORGANIZATION_ID} from '../../util/errorMessages.js'
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

/** Prompts for a studio hostname (or external URL) and registers it. */
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
          body: {appHost, type: 'studio', urlType},
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

/** Prompts for a title and creates a core application, retrying if the host is taken. */
export async function createUserApplicationForApp(
  organizationId?: string,
): Promise<UserApplication> {
  if (!organizationId) {
    throw new Error(NO_ORGANIZATION_ID)
  }

  // First get the title from the user
  const title = await input({
    message: 'Enter a title for your application:',
    validate: (input: string) => input.length > 0 || 'Title is required',
  })

  return tryCreateApp(title, organizationId)
}

// appHosts have some restrictions (no uppercase, must start with a letter)
const generateId = () => {
  const letters = 'abcdefghijklmnopqrstuvwxyz'
  const firstChar = customAlphabet(letters, 1)()
  const rest = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 11)()
  return `${firstChar}${rest}`
}

const tryCreateApp = async (title: string, organizationId: string) => {
  // we will likely prepend this with an org ID or other parameter in the future
  const appHost = generateId()

  const spin = spinner('Creating application').start()

  try {
    const response = await createUserApplication({
      appType: 'coreApp',
      body: {appHost, title, type: 'coreApp', urlType: 'internal'},
      organizationId,
    })

    spin.succeed()
    return response
  } catch (e) {
    // if the name is taken, generate a new one and try again
    if ([402, 409].includes(e?.statusCode)) {
      deployDebug('App host taken, retrying with new host')
      return tryCreateApp(title, organizationId)
    }

    spin.fail()

    deployDebug('Error creating core application', e)
    throw e
  }
}
