export function formatCliErrorMessages(messages: readonly string[]): string {
  return messages.join('\nError: ')
}
