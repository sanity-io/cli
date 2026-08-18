const formatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 1,
  minimumFractionDigits: 1,
  style: 'percent',
})

export const percent = (value: number): string => formatter.format(Math.min(value, 1))
