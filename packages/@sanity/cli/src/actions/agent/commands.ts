import {type CommandResult} from './types.js'

/**
 * Process built-in commands that start with /
 * @param input - User input
 * @returns Command result indicating if command was handled
 */
export function processCommand(input: string): CommandResult {
  const trimmed = input.trim()

  // Not a command
  if (!trimmed.startsWith('/')) {
    return {handled: false}
  }

  const command = trimmed.toLowerCase()

  // Help command
  if (command === '/help' || command === '/h') {
    return {
      handled: true,
      message: getHelpMessage(),
    }
  }

  // Exit commands
  if (command === '/exit' || command === '/quit' || command === '/q') {
    return {
      handled: true,
      message: 'Goodbye!',
      shouldExit: true,
    }
  }

  // Clear command
  if (command === '/clear' || command === '/c') {
    return {
      handled: true,
      message: 'Chat history cleared.',
      shouldClear: true,
    }
  }

  // Unknown command
  return {
    handled: true,
    message: `Unknown command: ${trimmed}. Type /help for available commands.`,
  }
}

/**
 * Get help message with available commands
 */
function getHelpMessage(): string {
  return `Available commands:

/help, /h      Show this help message
/clear, /c     Clear chat history
/exit, /quit   Exit the agent
/q

Keyboard shortcuts:
Ctrl+C         Exit
Ctrl+L         Clear screen
Ctrl+Enter     Send message

Just type your message and press Ctrl+Enter to chat with the agent!`
}
