/** App interface copy is always English; chat language is managed separately. */
export const WELCOME_COPY = {
  setup: "Set a 6-digit PIN",
  confirm: "Enter your PIN again",
  unlock: "Enter PIN to unlock",
  checking: "Checking sign-in…",
  signOut: "Sign out",
  retry: "Retry",
  delete: "Delete",
  deleteDigit: "Delete one digit",
  progress: (count: number, total: number) => `${count} of ${total} digits`,
  swipeUnlock: "Unlock",
  faceFailed: "Sign-in required",
  errors: {
    resumeUnavailable: "Could not check sign-in. Please retry.",
    storageUnavailable: "Could not check sign-in or save the PIN in this browser. Please retry.",
    mismatch: "PINs do not match. Set your PIN again.",
    signingOut: "Three incorrect PIN attempts. Signing out…",
    wrongPin: (remaining: number) =>
      `Incorrect PIN. ${remaining} ${remaining === 1 ? "attempt" : "attempts"} remaining.`,
    unlockUnavailable: "Could not unlock or sign out. Please retry.",
    signOutFailed: "Could not sign out. Please retry.",
  },
} as const;

export type WelcomeError = keyof typeof WELCOME_COPY.errors;
