import {type Schema} from '@sanity/types'
import startCase from 'lodash-es/startCase.js'

import {type ManifestSerializable} from './types.js'

/**
 * Context object passed to transformer functions
 */
export interface Context {
  schema: Schema
}

/**
 * Type for serializable properties that can be stored in the manifest
 */
export type SerializableProp = ManifestSerializable | ManifestSerializable[] | undefined

/**
 * Ensures a string value is returned for the given key, or an empty object if not a string
 */
export function ensureString<Key extends string>(key: Key, value: unknown) {
  if (typeof value === 'string') {
    return {
      [key]: value,
    }
  }

  return {}
}

/**
 * Ensures a conditional value is returned for the given key.
 * Returns the boolean value if it's a boolean, 'conditional' if it's a function, or empty object otherwise.
 */
export function ensureConditional<const Key extends string>(key: Key, value: unknown) {
  if (typeof value === 'boolean') {
    return {
      [key]: value,
    }
  }

  if (typeof value === 'function') {
    return {
      [key]: 'conditional',
    }
  }

  return {}
}

/**
 * Ensures a custom title is returned, omitting it if it matches the default startCase title
 */
export function ensureCustomTitle(typeName: string, value: unknown) {
  const titleObject = ensureString('title', value)

  const defaultTitle = startCase(typeName)
  // omit title if its the same as default, to reduce payload
  if (titleObject.title === defaultTitle) {
    return {}
  }
  return titleObject
}
