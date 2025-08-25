export function gracefulServerDeath(
  command: 'dev' | 'preview' | 'start',
  httpHost: string | undefined,
  httpPort: number,
  err: Error & {code?: string},
): Error {
  if (err.code === 'EADDRINUSE') {
    return new Error(
      `Port number is already in use, configure \`server.port\` in \`sanity.cli.js\` or pass \`--port <somePort>\` to \`sanity ${command}\``,
    )
  }

  if (err.code === 'EACCES') {
    const help =
      httpPort < 1024
        ? 'port numbers below 1024 requires root privileges'
        : `do you have access to listen to the given host (${httpHost || '127.0.0.1'})?`

    return new Error(`The studio server does not have access to listen to given port - ${help}`)
  }

  return err
}
