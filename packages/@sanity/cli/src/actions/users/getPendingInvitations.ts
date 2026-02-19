import {type Invite} from './types.js'

/**
 * Get pending invitations
 * @param invitations - List of invitations
 * @returns List of pending invitations
 * @internal
 */
export function getPendingInvitations(invitations: Invite[]) {
  return invitations
    .filter((invite) => !invite.isAccepted && !invite.isRevoked && !invite.acceptedByUserId)
    .map((invite) => ({
      date: invite.createdAt,
      id: '<pending>',
      name: invite.email,
      roles: invite.roles,
    }))
}
