export const KEYS = {
  ArrowDown: '\u001B[B',
  ArrowLeft: '\u001B[D',
  ArrowRight: '\u001B[C',
  ArrowUp: '\u001B[A',
  Backspace: '\u007F',
  Enter: '\r',
  Escape: '\u001B',
  Tab: '\t',
} as const

export type KeyName = keyof typeof KEYS
