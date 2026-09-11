/**
 * localStorage with the sharp edges removed: private browsing, quota limits and
 * corrupted values all degrade to a default instead of throwing.
 */
export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return fallback
    const parsed: unknown = JSON.parse(raw)
    return (parsed ?? fallback) as T
  } catch {
    return fallback
  }
}

export function save(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

export function remove(key: string): void {
  try { localStorage.removeItem(key) } catch { /* nothing to do */ }
}
