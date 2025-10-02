/**
 * WebSocket message types for agent communication
 * Based on the Ada agent implementation
 */

/**
 * Client -\> Server: Authenticate with WebSocket token
 */
interface AuthenticateMessage {
  payload: {
    token: string
  }
  type: 'authenticate'
}

/**
 * Server -\> Client: Authentication successful
 */
interface AuthenticationSuccessMessage {
  type: 'authentication_success'
}

/**
 * Client -\> Server: User message
 */
export interface UserMessage {
  payload: {
    content: string
  }
  requestId: string
  type: 'user_message'

  threadId?: string
}

/**
 * Server -\> Client: Agent message (streaming)
 */
export interface AgentMessage {
  payload: {
    content: string
    id: string
    metadata?: MessageMetadata
    revertable?: boolean
    timestamp: string
  }
  type: 'agent_message'

  threadId?: string
}

/**
 * Server -\> Client: Agent message completed
 */
export interface AgentCompletedMessage {
  payload: {
    checksum?: string
    id: string
    metadata?: MessageMetadata
  }
  type: 'agent_completed_message'

  threadId?: string
}

/**
 * Server -\> Client: Agent reasoning update
 */
export interface AgentReasoningMessage {
  payload: {
    messageId: string
    reasoningText: string
  }
  type: 'agent_reasoning'

  threadId?: string
}

/**
 * Server -\> Client: Agent state update
 */
interface AgentStateMessage {
  payload: {
    state: 'idle' | 'streaming'
  }
  type: 'agent_state'

  threadId?: string
}

/**
 * Server -\> Client: Error message
 */
interface ErrorMessage {
  payload: {
    code?: string
    details?: string
    message: string
  }
  type: 'error'

  threadId?: string
}

/**
 * Client -\> Server: Cancel request
 */
interface CancelRequestMessage {
  payload: {
    requestIdToCancel: string
  }
  requestId: string
  type: 'cancel_request'

  threadId?: string
}

/**
 * Heartbeat messages (ping/pong)
 */
interface PingMessage {
  type: 'ping'
}

interface PongMessage {
  type: 'pong'
}

/**
 * Message metadata
 */
interface MessageMetadata {
  [key: string]: unknown

  reasoning?: {
    content: string
  }
}

/**
 * Union type of all WebSocket messages
 */
export type WebSocketMessage =
  | AgentCompletedMessage
  | AgentMessage
  | AgentReasoningMessage
  | AgentStateMessage
  | AuthenticateMessage
  | AuthenticationSuccessMessage
  | CancelRequestMessage
  | ErrorMessage
  | PingMessage
  | PongMessage
  | UserMessage

/**
 * Agent state
 */
export type AgentState = 'connecting' | 'disconnected' | 'error' | 'idle' | 'streaming'
