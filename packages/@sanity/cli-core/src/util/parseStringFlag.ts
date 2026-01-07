/**
 * Parses an optional string flag from oclif.
 * If the input is undefined, return undefined
 * but if the input is empty, throw an error.
 *
 *
 * @param input - The input to parse
 * Throws an error if the input is empty
 */
export async function parseStringFlag(flagName: string, input?: string) {
  if (input === undefined) {
    return input
  }

  if (!input) {
    throw new Error(`${flagName} argument is empty`)
  }

  return input
}
