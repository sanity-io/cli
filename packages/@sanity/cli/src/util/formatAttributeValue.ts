export function formatAttributeValue(value: unknown): string {
  if (Array.isArray(value)) return JSON.stringify(value)
  return String(value)
}
