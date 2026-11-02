/** Optional exact, case-insensitive invitations. Empty permits any Google email. */
export function allowedEmails(value = process.env.AUTH_ALLOWED_EMAILS): string[] {
  return [...new Set((value ?? "").split(/[,;\s]+/).map((email) => email.trim().toLowerCase()).filter(Boolean))];
}

export function isAllowedEmail(email: string | null | undefined, value = process.env.AUTH_ALLOWED_EMAILS): boolean {
  const invited = allowedEmails(value);
  return !!email?.trim() && (invited.length === 0 || invited.includes(email.trim().toLowerCase()));
}

/** Trust Google's verified profile, never an email supplied by the browser. */
export function canSignInWithGoogle(
  provider: string | undefined,
  profile: { email?: unknown; email_verified?: unknown } | undefined,
  invitations = process.env.AUTH_ALLOWED_EMAILS,
): boolean {
  return provider === "google" && profile?.email_verified === true &&
    typeof profile.email === "string" && isAllowedEmail(profile.email, invitations);
}
