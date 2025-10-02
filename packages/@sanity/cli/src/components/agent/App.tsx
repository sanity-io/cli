import {Box, useApp, useInput} from 'ink'
import {nanoid} from 'nanoid'
import {useEffect, useRef, useState} from 'react'

import {AgentClient} from '../../services/agent/agentClient.js'
import {AGENT_LOG_PATH, logErrorToFile} from '../../services/agent/fileLogger.js'
import {type AgentState} from '../../actions/agent/agentTypes.js'
import {processCommand} from '../../actions/agent/commands.js'
import {type Message} from '../../actions/agent/types.js'
import {ChatHistory} from './ChatHistory.js'
import {Header} from './Header.js'
import {InputBox} from './InputBox.js'
import {StatusBar} from './StatusBar.js'

export function App() {
  const {exit} = useApp()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [agentState, setAgentState] = useState<AgentState>('disconnected')
  const agentClient = useRef<AgentClient | null>(null)
  const currentMessageId = useRef<string | null>(null)

  // Initialize agent client on mount
  useEffect(() => {
    const client = new AgentClient()
    agentClient.current = client

    // Subscribe to state changes
    client.onStateChange((state) => {
      setAgentState(state)
    })

    // Subscribe to agent messages
    client.onAgentMessage((message) => {
      const msgId = message.payload.id
      currentMessageId.current = msgId

      setMessages((prev) => {
        const existingIndex = prev.findIndex((m) => m.id === msgId)

        if (existingIndex === -1) {
          // Add new message
          const newMessage: Message = {
            content: message.payload.content,
            id: msgId,
            metadata: message.payload.metadata,
            revertable: message.payload.revertable,
            role: 'agent',
            timestamp: new Date(message.payload.timestamp),
          }
          return [...prev, newMessage]
        } else {
          // Append to existing message (streaming updates)
          const updated = [...prev]
          updated[existingIndex] = {
            ...updated[existingIndex],
            content: updated[existingIndex].content + message.payload.content,
            metadata: message.payload.metadata,
            revertable: message.payload.revertable,
            timestamp: new Date(message.payload.timestamp),
          }
          return updated
        }
      })
    })

    // Subscribe to agent completed messages
    client.onAgentCompleted(() => {
      // Agent finished responding, stop processing indicator
      setIsProcessing(false)
      currentMessageId.current = null
    })

    // Subscribe to agent reasoning messages
    client.onAgentReasoning((message) => {
      const msgId = message.payload.messageId
      const reasoningText = message.payload.reasoningText

      setMessages((prev) => {
        const existingIndex = prev.findIndex((m) => m.id === msgId)
        if (existingIndex !== -1) {
          // Update existing message with reasoning
          const updated = [...prev]
          updated[existingIndex] = {
            ...updated[existingIndex],
            metadata: {
              ...updated[existingIndex].metadata,
              reasoning: {
                content: reasoningText,
              },
            },
          }
          return updated
        }
        return prev
      })
    })

    // Subscribe to errors
    client.onError((error) => {
      logErrorToFile(error, 'Agent error')
      const errorMessage: Message = {
        content: `❌ Error: ${error.message}\n\n📝 Check logs at: ${AGENT_LOG_PATH}`,
        id: nanoid(),
        role: 'error',
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, errorMessage])
      setIsProcessing(false)
    })

    // Show connection progress in UI
    const connectionMessage: Message = {
      content: '🟡 Connecting to agent...',
      id: nanoid(),
      role: 'agent',
      timestamp: new Date(),
    }
    setMessages([connectionMessage])

    // Connect to agent
    client
      .connect()
      .then(() => {
        // Update connection message to show success
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === connectionMessage.id
              ? {...msg, content: '🟢 Connected! You can start chatting now.'}
              : msg,
          ),
        )
      })
      .catch((error) => {
        console.error('Failed to connect to agent: %o', error)
        const errorMessage: Message = {
          content: `❌ Failed to connect to agent: ${error.message}\n\n📝 Check logs at: ${AGENT_LOG_PATH}\n💡 Try running with DEBUG=sanity:agent for more details`,
          id: nanoid(),
          role: 'error',
          timestamp: new Date(),
        }
        setMessages((prev) => [...prev, errorMessage])
      })

    // Cleanup on unmount
    return () => {
      client.disconnect()
    }
  }, [])

  // Handle keyboard shortcuts
  useInput((input, key) => {
    // Ctrl+C to exit
    if (key.ctrl && input === 'c') {
      // Disconnect immediately without reconnection
      if (agentClient.current) {
        agentClient.current.disconnect()
      }
      exit()
    }

    // Ctrl+L to clear
    if (key.ctrl && input === 'l') {
      setMessages([])
    }
  })

  const handleSubmit = async () => {
    const userInput = input.trim()

    // Ignore empty input
    if (!userInput || isProcessing) {
      return
    }

    // Clear input immediately
    setInput('')

    // Check if it's a command
    const commandResult = processCommand(userInput)

    if (commandResult.handled) {
      // Handle exit command
      if (commandResult.shouldExit) {
        exit()
        return
      }

      // Handle clear command
      if (commandResult.shouldClear) {
        setMessages([])
        return
      }

      // Show command result message
      if (commandResult.message) {
        const systemMessage: Message = {
          content: commandResult.message,
          id: nanoid(),
          role: 'agent',
          timestamp: new Date(),
        }
        setMessages((prev) => [...prev, systemMessage])
      }
      return
    }

    // Add user message
    const userMessage: Message = {
      content: userInput,
      id: nanoid(),
      role: 'user',
      timestamp: new Date(),
    }
    setMessages((prev) => [...prev, userMessage])

    // Start processing
    setIsProcessing(true)

    try {
      // Send message via agent client
      if (agentClient.current) {
        agentClient.current.sendMessage(userInput)
      } else {
        throw new Error('Agent client not initialized')
      }
    } catch (error) {
      // Handle errors
      const errorMessage: Message = {
        content: `❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}\n\n📝 Check logs at: ${AGENT_LOG_PATH}`,
        id: nanoid(),
        role: 'error',
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, errorMessage])
      setIsProcessing(false)
    }
  }

  return (
    <Box flexDirection="column" height="100%" padding={1}>
      <Header />
      <Box flexDirection="column" flexGrow={1} marginY={1}>
        <ChatHistory messages={messages} />
      </Box>
      <Box marginY={1} width="100%">
        <InputBox
          disabled={isProcessing}
          onChange={setInput}
          onSubmit={handleSubmit}
          value={input}
        />
      </Box>
      <StatusBar agentState={agentState} isProcessing={isProcessing} />
    </Box>
  )
}
