// Parse dice notation like "2d6+3", "d20", "4d8-1"
export type DiceParseResult = {
  count: number;
  sides: number;
  modifier: number;
};

export function parseDiceNotation(notation: string): DiceParseResult | null {
  const match = notation
    .trim()
    .toLowerCase()
    .match(/^(\d*)d(\d+)([+-]\d+)?$/);

  if (!match) return null;

  const count = match[1] ? parseInt(match[1], 10) : 1;
  const sides = parseInt(match[2], 10);
  const modifier = match[3] ? parseInt(match[3], 10) : 0;

  if (count < 1 || count > 100 || sides < 1 || sides > 1000) return null;

  return { count, sides, modifier };
}

export function rollDice(parsed: DiceParseResult): {
  rolls: number[];
  total: number;
} {
  const rolls: number[] = [];
  for (let i = 0; i < parsed.count; i++) {
    rolls.push(Math.floor(Math.random() * parsed.sides) + 1);
  }
  const sum = rolls.reduce((a, b) => a + b, 0);
  return { rolls, total: sum + parsed.modifier };
}
