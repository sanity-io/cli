import {ALIAS_PREFIX} from '../../services/datasetAliases.js'

/**
 * Processes the alias name to handle the optional ~ prefix
 * @param aliasName - The raw alias name from user input
 * @returns Object containing apiName (without ~) and displayName (with ~)
 */
export function processAliasName(aliasName: string): {apiName: string; displayName: string} {
  let apiName = aliasName
  let displayName = aliasName

  if (aliasName.startsWith(ALIAS_PREFIX)) {
    apiName = aliasName.slice(1)
  } else {
    displayName = `${ALIAS_PREFIX}${aliasName}`
  }

  return {apiName, displayName}
}
