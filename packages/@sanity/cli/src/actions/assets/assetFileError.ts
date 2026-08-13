export class AssetFileError extends Error {
  constructor(public readonly reason: 'not-file' | 'unreadable') {
    super(reason)
    this.name = 'AssetFileError'
  }
}
