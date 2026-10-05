/**
 * Host patterns for the Grok sandbox live preview (`https://*.grok-sandbox.com`).
 * Passkey verification binds the origin to that host. There is no Grok OAuth
 * broker client anymore.
 */
export const PREVIEW_ALLOWED_HOSTS = ["*.grok-sandbox.com"] as const;
