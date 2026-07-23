export type MessageFunc = ({message}: {message: string}) => void

export interface BuildEventListener {
  onPreReleaseInInteractiveAutoUpdate(params: {prereleaseMessage: string}): Promise<void>
  onPreReleaseInNonInteractiveAutoUpdate: MessageFunc
}
