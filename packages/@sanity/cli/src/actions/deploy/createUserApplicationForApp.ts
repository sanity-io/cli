import {input} from '@inquirer/prompts'
import {customAlphabet} from 'nanoid'

import {spinner} from '../../core/spinner.js'
import {createUserApplication, type UserApplication} from '../../services/userApplications.js'
import {NO_ORGANIZATION_ID} from '../../util/errorMessages.js'
import {deployDebug} from './deployDebug.js'

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
      body: {
        appHost,
        title,
        type: 'coreApp',
        urlType: 'internal',
      },
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
