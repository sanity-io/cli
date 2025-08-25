export function toInt(value: number | string | undefined, defaultValue: number): number {
  if (value === undefined) {
    return defaultValue
  }

  const intVal = Number.parseInt(`${value}`, 10)
  return Number.isFinite(intVal) ? intVal : defaultValue
}
