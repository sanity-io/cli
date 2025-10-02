import {Box, Text} from 'ink'
import Spinner from 'ink-spinner'

import {type AgentState} from '../../actions/agent/agentTypes.js'

interface StatusBarProps {
  agentState: AgentState
  isProcessing: boolean
}

export function StatusBar({agentState, isProcessing}: StatusBarProps) {
  const getStatusText = (): {color: string; text: string} => {
    if (agentState === 'connecting') {
      return {color: 'yellow', text: 'Connecting...'}
    }
    if (agentState === 'disconnected') {
      return {color: 'red', text: 'Disconnected'}
    }
    if (agentState === 'error') {
      return {color: 'red', text: 'Connection Error'}
    }
    if (agentState === 'streaming' || isProcessing) {
      return {color: 'green', text: 'Thinking...'}
    }
    return {color: 'green', text: 'Connected'}
  }

  const status = getStatusText()

  return (
    <Box borderColor="gray" borderStyle="single" paddingX={1}>
      <Box flexGrow={1}>
        <Box>
          {(agentState === 'streaming' || isProcessing) && (
            <Text color={status.color}>
              <Spinner type="dots" />
            </Text>
          )}
          <Text color={status.color}> {status.text}</Text>
        </Box>
      </Box>
      <Box>
        <Text dimColor>Ctrl+C: Exit | Ctrl+L: Clear | /help: Commands</Text>
      </Box>
    </Box>
  )
}
