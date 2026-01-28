export function validateProjectName(input: string): string | true {
  if (!input || input.trim() === '') {
    return 'Project name cannot be empty'
  }
  if (input.length > 80) {
    return 'Project name cannot be longer than 80 characters'
  }
  return true
}
