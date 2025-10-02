import {EventEmitter} from 'node:events'

import debug from 'debug'
import WebSocket from 'ws'

import {type WebSocketMessage} from '../../actions/agent/agentTypes.js'
import {
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_TIMEOUT_MS,
  MAX_RECONNECT_ATTEMPTS,
  RECONNECT_DELAY_MS,
} from './constants.js'
import {logErrorToFile, logToFile} from './fileLogger.js'

const log = debug('sanity:agent:ws')

type WebSocketClientState = 'connected' | 'connecting' | 'disconnected' | 'error'

/**
 * Low-level WebSocket client for agent communication
 * Handles connection, reconnection, heartbeat, and message passing
 */
// eslint-disable-next-line unicorn/prefer-event-target
export class AgentWebSocketClient extends EventEmitter {
  private heartbeatTimeout: NodeJS.Timeout | null = null
  private heartbeatTimer: NodeJS.Timeout | null = null
  private isAuthenticated = false
  private reconnectAttempts = 0
  private reconnectTimer: NodeJS.Timeout | null = null
  private shouldReconnect = true
  private state: WebSocketClientState = 'disconnected'
  private token: string
  private url: string
  private ws: WebSocket | null = null

  constructor(url: string, token: string) {
    super()
    this.url = url
    this.token = token
  }

  /**
   * Connect to the WebSocket server
   */
  public connect(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      log('Already connected')
      return
    }

    // Clean up any existing connection
    this.cleanupWebSocket()

    this.setState('connecting')

    try {
      this.ws = new WebSocket(this.url)

      this.ws.on('open', () => this.handleOpen())
      this.ws.on('message', (data: WebSocket.RawData) => this.handleMessage(data))
      this.ws.on('error', (error: Error) => this.handleError(error))
      this.ws.on('close', (code: number, reason: Buffer) => this.handleClose(code, reason))
    } catch (error) {
      log('Connection error: %o', error)
      this.handleError(error instanceof Error ? error : new Error(String(error)))
    }
  }

  /**
   * Disconnect from the server
   */
  public disconnect(): void {
    log('Disconnecting')
    this.shouldReconnect = false
    this.cleanup()
    this.cleanupWebSocket()
    this.setState('disconnected')
  }

  /**
   * Get current connection state
   */
  public getState(): WebSocketClientState {
    return this.state
  }

  /**
   * Check if authenticated
   */
  public isAuthenticatedState(): boolean {
    return this.isAuthenticated
  }

  /**
   * Send a message to the server
   */
  public send(message: WebSocketMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      log('Cannot send message, not connected')
      throw new Error('WebSocket is not connected')
    }

    const payload = JSON.stringify(message)
    log('Sending message: %s', message.type)
    this.ws.send(payload)
  }

  /**
   * Attempt to reconnect
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      log('Max reconnection attempts reached')
      this.setState('error')
      this.emit('error', new Error('Maximum reconnection attempts reached'))
      return
    }

    this.reconnectAttempts++
    const delay = RECONNECT_DELAY_MS * this.reconnectAttempts

    log(
      'Reconnecting in %dms (attempt %d/%d)',
      delay,
      this.reconnectAttempts,
      MAX_RECONNECT_ATTEMPTS,
    )

    this.reconnectTimer = setTimeout(() => {
      this.connect()
    }, delay)
  }

  /**
   * Cleanup timers and handlers
   */
  private cleanup(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }

    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout)
      this.heartbeatTimeout = null
    }
  }

  /**
   * Cleanup WebSocket connection and remove all listeners
   */
  private cleanupWebSocket(): void {
    if (this.ws) {
      // Remove all listeners to prevent memory leaks
      this.ws.removeAllListeners()
      // Close the connection if it's not already closed
      if (this.ws.readyState !== WebSocket.CLOSED) {
        this.ws.close(1000, 'Client disconnect')
      }
      this.ws = null
    }
  }

  /**
   * Handle connection close
   */
  private handleClose(code: number, reason: Buffer): void {
    log('WebSocket closed: code=%d, reason=%s', code, reason.toString())
    this.isAuthenticated = false
    this.cleanup()

    // Don't reconnect if this was a normal closure or client disconnect
    if (code === 1000 || !this.shouldReconnect) {
      this.setState('disconnected')
      this.emit('close', code, reason.toString())
      return
    }

    // Attempt reconnection
    this.setState('disconnected')
    this.emit('close', code, reason.toString())
    this.attemptReconnect()
  }

  /**
   * Handle error
   */
  private handleError(error: Error): void {
    log('WebSocket error: %o', error)
    logErrorToFile(error, 'WebSocket error')
    this.setState('error')
    this.emit('error', error)
  }

  /**
   * Handle incoming message
   */
  private handleMessage(data: WebSocket.RawData): void {
    try {
      const message = JSON.parse(data.toString()) as WebSocketMessage

      log('Received message: %s', message.type)

      // Handle authentication success
      if (message.type === 'authentication_success') {
        log('Authentication successful')
        logToFile('WebSocket authentication successful', 'info')
        this.isAuthenticated = true
        this.startHeartbeat()
        this.emit('authenticated')
      }

      // Handle pong
      if (message.type === 'pong') {
        log('Received pong')
        this.resetHeartbeatTimeout()
        return
      }

      // Emit message event
      this.emit('message', message)
    } catch (error) {
      log('Failed to parse message: %o', error)
      this.emit('error', new Error('Failed to parse WebSocket message'))
    }
  }

  /**
   * Handle connection open
   */
  private handleOpen(): void {
    log('WebSocket connected, sending authentication')
    logToFile('WebSocket connected, sending authentication', 'info')
    this.reconnectAttempts = 0
    this.setState('connected')

    // Send authentication message
    try {
      this.send({
        payload: {
          token: this.token,
        },
        type: 'authenticate',
      })
    } catch (error) {
      log('Failed to send authentication: %o', error)
      this.handleError(error instanceof Error ? error : new Error(String(error)))
    }
  }

  /**
   * Reset heartbeat timeout
   */
  private resetHeartbeatTimeout(): void {
    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout)
      this.heartbeatTimeout = null
    }
  }

  /**
   * Set and emit state change
   */
  private setState(state: WebSocketClientState): void {
    if (this.state !== state) {
      this.state = state
      log('State changed to: %s', state)
      this.emit('stateChange', state)
    }
  }

  /**
   * Start heartbeat mechanism
   */
  private startHeartbeat(): void {
    log('Starting heartbeat')

    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        log('Sending ping')
        this.send({type: 'ping'})
        this.startHeartbeatTimeout()
      }
    }, HEARTBEAT_INTERVAL_MS)
  }

  /**
   * Start heartbeat timeout
   */
  private startHeartbeatTimeout(): void {
    this.heartbeatTimeout = setTimeout(() => {
      log('Heartbeat timeout, closing connection')
      if (this.ws) {
        this.ws.close(3001, 'Heartbeat timeout')
      }
    }, HEARTBEAT_TIMEOUT_MS)
  }
}
