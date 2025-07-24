import {type Command} from '@oclif/core'

export interface Output {
  error: Command['error']
  log: Command['log']
  warn: Command['warn']
}

export type RequireProps<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>
