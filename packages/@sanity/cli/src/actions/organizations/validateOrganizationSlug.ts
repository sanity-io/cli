export function validateOrganizationSlug(input: string): string | true {
  if (!input || input.trim() === '') {
    return 'Organization slug cannot be empty'
  }
  if (input !== input.toLowerCase()) {
    return 'Organization slug must be lowercase'
  }
  if (/\s/.test(input)) {
    return 'Organization slug cannot contain spaces'
  }
  return true
}
