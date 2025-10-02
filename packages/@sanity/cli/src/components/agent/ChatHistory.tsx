import {Box, Text} from 'ink'

import {type Message} from '../../actions/agent/types.js'
import {ChatMessage} from './ChatMessage.js'

interface ChatHistoryProps {
  messages: Message[]
}

export function ChatHistory({messages}: ChatHistoryProps) {
  if (messages.length === 0) {
    return (
      <Box paddingY={1}>
        <Text dimColor>
          No messages yet. Type a message and press Ctrl+Enter to start chatting!
        </Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="column" paddingY={1}>
      {messages.map((message) => (
        <ChatMessage key={message.id} message={message} />
      ))}
    </Box>
  )
}
