/**
 * Context commands removed when imports became sources, with what replaces
 * each. The command_not_found hook names the replacement instead of guessing
 * a similar name.
 */
const REPLACEMENTS: Record<string, string> = {
  'context:imports': 'sanity context sources',
  'context:imports:create': 'sanity context sources create',
  'context:imports:delete': 'sanity context sources delete',
  'context:imports:download': 'sanity context documents content --format raw',
  'context:imports:get': 'sanity context sources get',
  'context:imports:list': 'sanity context sources list',
  'context:refresh': 'sanity context sync',
}

/** The message for a removed context command, or `undefined` for any other id */
export function removedContextCommandHint(id: string): string | undefined {
  const replacement = REPLACEMENTS[id]
  if (replacement === undefined) return undefined
  const removed = `sanity ${id.replaceAll(':', ' ')}`
  return id === 'context:refresh'
    ? `\`${removed}\` was removed. To sync every source of a knowledge base, use \`${replacement}\`.`
    : `\`${removed}\` was removed: imports are now sources, and what they read are documents. Use \`${replacement}\`.`
}
