// D&D-themed join code generation
// Priority: single words -> two-word combos -> random

const WORDS = [
  "GOBLIN", "DRAGON", "WIZARD", "CLERIC", "KNIGHT", "RANGER",
  "UNDEAD", "SHADOW", "ARCANE", "POISON", "SHIELD", "DAGGER",
  "SCROLL", "POTION", "THRONE", "MYTHIC", "BLIGHT", "VORTEX",
  "SPHINX", "WYVERN", "ZOMBIE", "KOBOLD", "RITUAL", "MYSTIC",
  "FLAMES", "HUNTER", "SPIRIT", "GHOSTS", "DEMONS", "ANGELS",
  "TITANS", "DRAKES", "ORCISH", "SIGILS", "TEMPLE", "NATURE",
  "QUESTS", "HEROES", "ROGUES", "DRUIDS", "SWORDS", "ARROWS",
  "MOUNTS", "BEASTS", "TAVERN", "FOREST", "CASTLE", "BATTLE",
  "SMITHS", "HAMMER", "SPELLS", "CANDLE", "CRYPTS", "GIANTS",
  "GOLEMS", "STORMS", "FROZEN", "MOLTEN", "CURSED", "SACRED",
  "DIVINE", "AMULET", "SILVER", "GOLDEN", "BRONZE", "CHAINS",
  "SKULLS", "RAVENS", "WOLVES", "LICHEN", "TALONS", "HORNED",
  "WINGED", "SCALED", "SHAMAN", "TOTEMS", "TRIBAL", "SAVAGE",
  "PRIMAL", "ARCANA", "ELIXIR", "SERAPH", "PLAGUE", "WRAITH",
  "BANDIT", "PIRATE", "AMBUSH", "VAULTS", "RELICS", "FORGED",
  "RAGING", "FRENZY", "SUMMIT", "CAVERN", "GROTTO", "BRIDGE",
  "PORTAL", "TOWERS", "BLAZES", "DRYADS", "NYMPHS", "PIXIES",
  "TROLLS", "KRAKEN", "DJINNI", "EIDOLO", "PHYLAC", "ALCHEMY",
  "SCORCH", "EMBER",  "VENOM",  "THORNS", "MARSH",  "ABYSS",
];

// 3-letter fragments for two-word combos (prefix + suffix = 6 chars)
const PREFIXES = [
  "RED", "ICE", "ORC", "ELF", "AXE", "BOW", "WAR", "SUN",
  "OWL", "BAT", "FOG", "GEM", "OLD", "BIG", "DIM", "OAK",
  "ASH", "IMP", "FEY", "HEX", "MUD", "INK", "FUR", "SKY",
  "SEA", "WEB", "DRY", "RAW", "TAN", "RIM", "IRE", "ORE",
  "VEX", "RUN", "LOW", "TIN", "YEW", "ELM", "IVY", "DEN",
];

const SUFFIXES = [
  "AXE", "BOW", "DEN", "PIT", "ALE", "INN", "ORB", "GEM",
  "KEY", "MAP", "RUN", "JAR", "OWL", "BAT", "FOG", "ROD",
  "EEL", "RAM", "YEW", "HEN", "JAW", "PAW", "RIB", "FIN",
  "OAK", "ELF", "FEY", "HEX", "EYE", "FUR", "CUB", "ORE",
  "ORC", "ARK", "DAM", "SKY", "AGE", "ERA", "END", "WAR",
];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Filter to valid 6-char codes
const VALID_WORDS = WORDS.filter((w) => w.length === 6);

export function generateJoinCode(usedCodes: Set<string>): string {
  // 1. Try a single memorable word
  const availableWords = VALID_WORDS.filter((w) => !usedCodes.has(w));
  if (availableWords.length > 0) {
    return pickRandom(availableWords);
  }

  // 2. Try two-word combos (prefix + suffix)
  // With 40x40=1600 combos, random sampling is efficient
  for (let i = 0; i < 200; i++) {
    const code = pickRandom(PREFIXES) + pickRandom(SUFFIXES);
    if (!usedCodes.has(code)) return code;
  }

  // 3. Fall back to random alphanumeric (no ambiguous chars)
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let i = 0; i < 100; i++) {
    let code = "";
    for (let j = 0; j < 6; j++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    if (!usedCodes.has(code)) return code;
  }

  // Extremely unlikely: brute force remaining combos
  for (const p of PREFIXES) {
    for (const s of SUFFIXES) {
      const code = p + s;
      if (!usedCodes.has(code)) return code;
    }
  }

  throw new Error("Could not generate unique join code");
}
