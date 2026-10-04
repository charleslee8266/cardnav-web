/** A gateway must support every selected capability within a filter group. */
export function matchesAllSelections(selected: readonly string[], available: readonly string[]): boolean {
  return selected.every(value => available.includes(value));
}
