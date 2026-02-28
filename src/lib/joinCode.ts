// Word-based join codes that are memorable and fun for D&D
const WORDS = [
  "GOBLIN", "DRAGON", "WIZARD", "SWORD", "ROGUE", "CLERIC",
  "KNIGHT", "RANGER", "PALADI", "DRUIDS", "ORCISH", "UNDEAD",
  "SHADOW", "ARCANE", "POISON", "SHIELD", "DAGGER", "SCROLL",
  "POTION", "CANDLE", "DUNGEON".slice(0, 6), "CASTLE".slice(0, 6),
  "THRONE", "CRYPT", "DEMONS", "ANGELS", "MYTHIC", "RUNIC",
  "NECROS", "FLAMEQ".slice(0, 6), "FROSTY".slice(0, 6),
  "STORMY".slice(0, 6), "BLIGHT", "VORTEX",
];

// Generate a random 6-character code
export function generateJoinCode(): string {
  // 70% chance: pick a word from the list
  if (Math.random() < 0.7 && WORDS.length > 0) {
    const word = WORDS[Math.floor(Math.random() * WORDS.length)];
    return word.slice(0, 6).toUpperCase();
  }

  // 30% chance: random alphanumeric (no ambiguous chars)
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}
