import {confirm} from '@sanity/cli-core/ux'

/**
 * Prompt the user with a single yes/no for installing Sanity agent skills.
 *
 * Skills are project-local files, so we don't ask per-editor — if the user
 * says yes, skills are installed for every detected editor that has a
 * skills CLI mapping.
 */
export async function promptForSkillsSetup(): Promise<boolean> {
  return await confirm({
    default: true,
    message: 'Install Sanity agent skills into this project?',
  })
}
