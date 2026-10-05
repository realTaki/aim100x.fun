/** First load / user switch must hydrate even if empty draft looks dirty vs stored. */
export function shouldHydrateProfileForm(input: {
  applied: { key: string } | null;
  profileKey: string;
  isDirty: boolean;
  formMatchesLastApply: boolean;
}): boolean {
  if (input.applied?.key === input.profileKey) return false;
  if (input.applied && input.isDirty && !input.formMatchesLastApply) return false;
  return true;
}
