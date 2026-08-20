export const passwordChangeError = (
  currentPassword: string,
  newPassword: string,
  confirmation: string,
): string | undefined => {
  if (newPassword !== confirmation) return 'The new password confirmation does not match.';
  if (currentPassword === newPassword)
    return 'The new password must be different from the current password.';
  return undefined;
};
