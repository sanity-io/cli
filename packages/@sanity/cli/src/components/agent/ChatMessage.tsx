import {Box, Text} from 'ink'
import {marked, type MarkedExtension} from 'marked'
import {markedTerminal} from 'marked-terminal'

import {type Message} from '../../actions/agent/types.js'

// Configure marked to use terminal renderer
marked.use(markedTerminal() as MarkedExtension)

interface ChatMessageProps {
  message: Message
}

export function ChatMessage({message}: ChatMessageProps) {
  const isUser = message.role === 'user'
  const color = isUser ? 'cyan' : 'green'
  const label = isUser ? 'You' : 'Agent'

  // Render markdown for agent messages, plain text for user messages
  // Use marked.parse with async:false to ensure synchronous execution
  const formattedContent = isUser ? message.content : marked.parse(message.content, {async: false})

  return (
    <Box flexDirection="column" marginY={1}>
      <Box>
        <Text bold color={color}>
          {label}:{' '}
        </Text>
        <Text dimColor>{formatTime(message.timestamp)}</Text>
      </Box>
      <Box paddingLeft={2}>
        <Text>{formattedContent}</Text>
      </Box>
    </Box>
  )
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}
