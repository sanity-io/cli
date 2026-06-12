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
  if (!/^[a-z0-9-]+$/.test(input)) {
    return 'Organization slug may only contain lowercase letters, numbers, and dashes'
  }
  if (input.startsWith('-') || input.endsWith('-')) {
    return 'Organization slug cannot start or end with a dash'
  }
  return true
}
