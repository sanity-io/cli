import {randomUUID} from 'node:crypto'

import debug from 'debug'

import {
  type AgentCompletedMessage,
  type AgentMessage,
  type AgentReasoningMessage,
  type AgentState,
  type UserMessage,
  type WebSocketMessage,
} from '../../actions/agent/agentTypes.js'
import {getAgentWebSocketToken} from './authentication.js'
import {API_VERSION, WS_HOST} from './constants.js'
import {logErrorToFile, logToFile} from './fileLogger.js'
import {AgentWebSocketClient} from './websocketClient.js'

const log = debug('sanity:agent:client')

/**
 * Callback types for agent client events
 */
type AgentMessageCallback = (message: AgentMessage) => void
type AgentCompletedCallback = (message: AgentCompletedMessage) => void
type AgentReasoningCallback = (message: AgentReasoningMessage) => void
type AgentStateCallback = (state: AgentState) => void
type AgentErrorCallback = (error: Error) => void

/**
 * High-level agent client for easy integration with UI
 * Manages connection, authentication, and message streaming
 */
export class AgentClient {
  private completedCallbacks: AgentCompletedCallback[] = []
  private connectionPromise: Promise<void> | null = null

  private connectionReject: ((error: Error) => void) | null = null
  private connectionResolve: (() => void) | null = null
  private currentState: AgentState = 'disconnected'
  private errorCallbacks: AgentErrorCallback[] = []
  // Event callbacks
  private messageCallbacks: AgentMessageCallback[] = []

  private reasoningCallbacks: AgentReasoningCallback[] = []
  private stateCallbacks: AgentStateCallback[] = []
  private threadId?: string
  private wsClient: AgentWebSocketClient | null = null

  /**
   * Connect to the agent API
   */
  public async connect(): Promise<void> {
    if (this.wsClient) {
      log('Already connected or connecting')
      return this.connectionPromise || Promise.resolve()
    }

    // Create a promise that resolves when connected
    this.connectionPromise = new Promise((resolve, reject) => {
      this.connectionResolve = resolve
      this.connectionReject = reject
    })

    try {
      this.setState('connecting')
      log('Getting WebSocket token')
      await logToFile('Starting agent connection', 'info')

      // Get WebSocket token from handshake endpoint
      const token = await getAgentWebSocketToken()

      // Create WebSocket URL
      const wsUrl = `${WS_HOST}/${API_VERSION}/agent`
      log('Connecting to WebSocket: %s', wsUrl)
      await logToFile(`WebSocket URL: ${wsUrl}`, 'debug')

      // Create WebSocket client
      this.wsClient = new AgentWebSocketClient(wsUrl, token)

      // Setup event handlers
      this.wsClient.on('authenticated', () => {
        log('WebSocket authenticated')
        this.setState('idle')
        // Resolve connection promise when authenticated
        if (this.connectionResolve) {
          this.connectionResolve()
          this.connectionResolve = null
          this.connectionReject = null
        }
      })

      this.wsClient.on('message', (message: WebSocketMessage) => {
        this.handleMessage(message)
      })

      this.wsClient.on('error', (error: Error) => {
        log('WebSocket error: %o', error)
        this.setState('error')
        this.emitError(error)
        // Reject connection promise on error
        if (this.connectionReject) {
          this.connectionReject(error)
          this.connectionResolve = null
          this.connectionReject = null
        }
      })

      this.wsClient.on('close', () => {
        log('WebSocket closed')
        this.setState('disconnected')
      })

      this.wsClient.on('stateChange', (state: string) => {
        log('WebSocket state: %s', state)
        if (state === 'error') {
          this.setState('error')
        } else if (state === 'disconnected') {
          this.setState('disconnected')
        }
      })

      // Connect
      this.wsClient.connect()
    } catch (error) {
      log('Connection failed: %o', error)
      await logErrorToFile(
        error instanceof Error ? error : new Error(String(error)),
        'Agent connection failed',
      )
      this.setState('error')
      this.emitError(error instanceof Error ? error : new Error(String(error)))
      // Reject connection promise on connection failure
      if (this.connectionReject) {
        this.connectionReject(error instanceof Error ? error : new Error(String(error)))
        this.connectionResolve = null
        this.connectionReject = null
      }
      throw error
    }

    return this.connectionPromise
  }

  /**
   * Disconnect from the agent
   */
  public disconnect(): void {
    log('Disconnecting agent client')

    // Clean up connection promise if still pending
    if (this.connectionReject) {
      this.connectionReject(new Error('Client disconnected'))
      this.connectionResolve = null
      this.connectionReject = null
      this.connectionPromise = null
    }

    if (this.wsClient) {
      this.wsClient.disconnect()
      this.wsClient = null
    }

    this.setState('disconnected')
  }

  /**
   * Get current state
   */
  public getState(): AgentState {
    return this.currentState
  }

  /**
   * Subscribe to agent completed messages
   */
  public onAgentCompleted(callback: AgentCompletedCallback): () => void {
    this.completedCallbacks.push(callback)
    return () => {
      this.completedCallbacks = this.completedCallbacks.filter((cb) => cb !== callback)
    }
  }

  /**
   * Subscribe to agent messages
   */
  public onAgentMessage(callback: AgentMessageCallback): () => void {
    this.messageCallbacks.push(callback)
    return () => {
      this.messageCallbacks = this.messageCallbacks.filter((cb) => cb !== callback)
    }
  }

  /**
   * Subscribe to agent reasoning messages
   */
  public onAgentReasoning(callback: AgentReasoningCallback): () => void {
    this.reasoningCallbacks.push(callback)
    return () => {
      this.reasoningCallbacks = this.reasoningCallbacks.filter((cb) => cb !== callback)
    }
  }

  /**
   * Subscribe to errors
   */
  public onError(callback: AgentErrorCallback): () => void {
    this.errorCallbacks.push(callback)
    return () => {
      this.errorCallbacks = this.errorCallbacks.filter((cb) => cb !== callback)
    }
  }

  /**
   * Subscribe to state changes
   */
  public onStateChange(callback: AgentStateCallback): () => void {
    this.stateCallbacks.push(callback)
    return () => {
      this.stateCallbacks = this.stateCallbacks.filter((cb) => cb !== callback)
    }
  }

  /**
   * Send a message to the agent
   */
  public sendMessage(content: string, threadId?: string): void {
    if (!this.wsClient || !this.wsClient.isAuthenticatedState()) {
      const error = new Error('Not connected to agent')
      log('Cannot send message: %s', error.message)
      this.emitError(error)
      throw error
    }

    const requestId = this.generateRequestId()
    this.threadId = threadId || this.threadId

    log('Sending user message (requestId: %s, threadId: %s)', requestId, this.threadId)

    const message: UserMessage = {
      payload: {
        content,
      },
      requestId,
      threadId: this.threadId,
      type: 'user_message',
    }

    this.wsClient.send(message)
  }

  /**
   * Wait for connection to be ready (authenticated)
   * This is useful when you want to delay actions until fully connected
   */
  public async waitForReady(): Promise<void> {
    if (this.currentState === 'idle' || this.currentState === 'streaming') {
      return
    }

    if (this.connectionPromise) {
      return this.connectionPromise
    }

    throw new Error('Not connected - call connect() first')
  }

  /**
   * Emit error to callbacks
   */
  private emitError(error: Error): void {
    for (const cb of this.errorCallbacks) cb(error)
  }

  /**
   * Generate a unique request ID
   */
  private generateRequestId(): string {
    return randomUUID()
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(message: WebSocketMessage): void {
    switch (message.type) {
      case 'agent_completed_message': {
        log('Agent message completed: %s', message.payload.id)
        for (const cb of this.completedCallbacks) cb(message)
        break
      }

      case 'agent_message': {
        log('Agent message received: %s', message.payload.id)
        for (const cb of this.messageCallbacks) cb(message)
        break
      }

      case 'agent_reasoning': {
        log('Agent reasoning update: %s', message.payload.messageId)
        for (const cb of this.reasoningCallbacks) cb(message)
        break
      }

      case 'agent_state': {
        log('Agent state update: %s', message.payload.state)
        this.setState(message.payload.state)
        break
      }

      case 'error': {
        log('Agent error: %s', message.payload.message)
        this.emitError(new Error(message.payload.message))
        break
      }
    }
  }

  /**
   * Set state and notify callbacks
   */
  private setState(state: AgentState): void {
    if (this.currentState !== state) {
      this.currentState = state
      log('State changed to: %s', state)
      for (const cb of this.stateCallbacks) cb(state)
    }
  }
}
