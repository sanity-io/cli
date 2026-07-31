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

export function formatClaimTimeLeft(msLeft: number): string {
  const remainingMinutes = Math.max(0, Math.floor(msLeft / (60 * 1000)))
  const hours = Math.floor(remainingMinutes / 60)
  const minutes = remainingMinutes % 60

  return `${hours}h ${minutes.toString().padStart(2, '0')}m`
}
