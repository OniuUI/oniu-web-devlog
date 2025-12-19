export function formatLastSeen(lastSeen: number): string {
  const now = Date.now()
  const diff = now - lastSeen
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (seconds < 45) {
    return 'online'
  } else if (seconds < 60) {
    return `${seconds}s ago`
  } else if (minutes < 60) {
    return `${minutes}m ago`
  } else if (hours < 24) {
    return `${hours}h ago`
  } else if (days < 7) {
    return `${days}d ago`
  } else {
    return new Date(lastSeen).toLocaleDateString()
  }
}

export function isOnline(lastSeen: number, thresholdMs = 45000): boolean {
  return Date.now() - lastSeen < thresholdMs
}
