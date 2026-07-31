export function formatClaimDeadline(expiresAt: string): string {
  const deadline = new Date(expiresAt)
  if (!Number.isFinite(deadline.getTime())) return expiresAt
  return (
    new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      hour: '2-digit',
      hour12: false,
      minute: '2-digit',
      month: 'long',
      timeZone: 'UTC',
      year: 'numeric',
    })
      .format(deadline)
      .replace(' at ', ', ') + ' UTC'
  )
}
