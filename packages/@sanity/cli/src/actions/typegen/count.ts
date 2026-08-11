export const count = (
  amount: number,
  plural: string = '',
  singular: string = plural.slice(0, Math.max(0, plural.length - 1)),
): string =>
  [amount.toLocaleString('en-US'), amount === 1 ? singular : plural].filter(Boolean).join(' ')
