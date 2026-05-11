// Central auth policy switch.
// true: email verification is required before dashboard, sync and local identity.
// false: authenticated users can enter even when Firebase Auth emailVerified is false.
export const AUTH_EMAIL_VERIFICATION_REQUIRED = true
