import {subdebug} from '@sanity/cli-core/debug'

import {SANITY_NEW_URL} from '../util/mintProjectConstants.js'

const debug = subdebug('new:instructions')

const INSTRUCTIONS_TIMEOUT = 10_000

/**
 * Prerendered markdown route on sanity.new. Preferred over content negotiation on `/`, which
 * depends on request headers and can fall through to the HTML page.
 */
export const INSTRUCTIONS_URL = `${SANITY_NEW_URL}/llms.txt`

const HTML_PATTERN = /^\s*(?:<!doctype html|<html[\s>])/iu

export class InstructionsUnavailableError extends Error {
  constructor(reason: string) {
    super(`Could not fetch the setup instructions from ${INSTRUCTIONS_URL}: ${reason}`)
    this.name = 'InstructionsUnavailableError'
  }
}

/**
 * Fetches the agent setup instructions from sanity.new, which is the single source of truth for
 * them. Deliberately not bundled with the CLI: a stale local copy is worse than a clear failure.
 */
export async function fetchNewInstructions(): Promise<string> {
  debug('fetching instructions from %s', INSTRUCTIONS_URL)

  let response: Response
  try {
    response = await fetch(INSTRUCTIONS_URL, {
      headers: {Accept: 'text/markdown'},
      method: 'GET',
      signal: AbortSignal.timeout(INSTRUCTIONS_TIMEOUT),
    })
  } catch (err) {
    const reason =
      err instanceof Error && err.name === 'TimeoutError'
        ? `the request timed out after ${INSTRUCTIONS_TIMEOUT / 1000} seconds`
        : `${err instanceof Error ? err.message : err}`
    throw new InstructionsUnavailableError(reason)
  }

  if (!response.ok) {
    throw new InstructionsUnavailableError(`the server responded with HTTP ${response.status}`)
  }

  const body = (await response.text()).trim()

  if (!body) {
    throw new InstructionsUnavailableError('the response was empty')
  }

  if (HTML_PATTERN.test(body)) {
    throw new InstructionsUnavailableError('the response was HTML rather than markdown')
  }

  debug('fetched %d characters', body.length)
  return body
}
