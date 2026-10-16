export const LIST_KINDS = ['partner', 'support', 'favorite', 'other'] as const;
export type ListKind = typeof LIST_KINDS[number];

export type ListKindState = { sponsor: boolean; supportPoints: number; favorite: boolean };

/** Filter by actual status, independently of pin quotas and the selected sort. */
export function matchesListKinds(selected: readonly string[], state: ListKindState): boolean {
  if (!selected.length) return true;
  return selected.some(kind => {
    if (kind === 'partner') return state.sponsor;
    if (kind === 'support') return state.supportPoints > 0;
    if (kind === 'favorite') return state.favorite;
    return kind === 'other' && !state.sponsor && !(state.supportPoints > 0) && !state.favorite;
  });
}
