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

/**
 * The message for a removed context command, or `undefined` for any other id. oclif joins the
 * arguments onto the id it can't find (`context:refresh:kb123`), so the longest known prefix wins.
 */
export function removedContextCommandHint(fullId: string): string | undefined {
  const parts = fullId.split(':')
  const id = parts
    .map((_, i) => parts.slice(0, parts.length - i).join(':'))
    .find((prefix) => prefix in REPLACEMENTS)
  if (id === undefined) return undefined
  const replacement = REPLACEMENTS[id]
  const removed = `sanity ${id.replaceAll(':', ' ')}`
  return id === 'context:refresh'
    ? `\`${removed}\` was removed. To sync every source of a knowledge base, use \`${replacement}\`.`
    : `\`${removed}\` was removed: imports are now sources, and what they read are documents. Use \`${replacement}\`.`
}
