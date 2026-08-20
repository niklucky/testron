# Accounts, members, and invitations

## Permissions

- A project owner always has project access and is the only user who can block or unblock members.
- An accepted, unblocked member can read and change project resources and invite another person.
- A pending invitation can be cancelled by its original inviter or the project owner.
- A blocked member immediately loses project access. Unblocking restores the existing membership.

## Invitation lifecycle

Invitations begin as `invited` and may transition once to `accepted`, `rejected`, or `cancelled`.
Only the account whose normalized email matches the invitation may accept or reject it. Accepting
creates the project membership. Testron prevents more than one pending invitation for the same
project and email, including under concurrent requests. Invitations do not expire in this version.

## Password session policy

Changing a password requires the current password. A successful change preserves existing signed-in
sessions; the new password is required for future sign-ins. Password values are accepted only by the
account mutation and are never returned in protocol resources or written to application logs.
