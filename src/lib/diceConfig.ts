export const DICE_CONFIG: Record<
  string,
  { color: string; cssVar: string; icon: string }
> = {
  d4: { color: "#a855f7", cssVar: "var(--dice-d4)", icon: "Triangle" },
  d6: { color: "#3b82f6", cssVar: "var(--dice-d6)", icon: "Dice6" },
  d8: { color: "#22c55e", cssVar: "var(--dice-d8)", icon: "Octagon" },
  d10: { color: "#eab308", cssVar: "var(--dice-d10)", icon: "Diamond" },
  d12: { color: "#f97316", cssVar: "var(--dice-d12)", icon: "Pentagon" },
  d20: { color: "#ef4444", cssVar: "var(--dice-d20)", icon: "Hexagon" },
  d100: { color: "#ec4899", cssVar: "var(--dice-d100)", icon: "Circle" },
};

/** Extract the primary die type from a notation like "2d6+3" */
export function getPrimaryDieType(notation: string): string | null {
  const match = notation.match(/d(\d+)/i);
  if (!match) return null;
  const key = `d${match[1]}`;
  return key in DICE_CONFIG ? key : null;
}

/** Detect nat 20 (single d20, result = 20) */
export function isNat20(notation: string, rolls: number[]): boolean {
  return /^1?d20$/i.test(notation.replace(/\s/g, "")) && rolls.length === 1 && rolls[0] === 20;
}

/** Detect nat 1 (single d20, result = 1) */
export function isNat1(notation: string, rolls: number[]): boolean {
  return /^1?d20$/i.test(notation.replace(/\s/g, "")) && rolls.length === 1 && rolls[0] === 1;
}
