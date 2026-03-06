import type { CombatantType } from "@prisma/client";

const TYPE_COLORS: Record<CombatantType, string> = {
  MONSTER: "text-accent-red",
  PLAYER_CHARACTER: "text-accent-green",
  COMPANION: "text-amber-400",
  NPC: "text-accent-blue",
};

const TYPE_LABELS: Record<CombatantType, string> = {
  MONSTER: "MON",
  PLAYER_CHARACTER: "PC",
  COMPANION: "CMP",
  NPC: "NPC",
};

export function getTypeColor(type: CombatantType): string {
  return TYPE_COLORS[type];
}

export function getTypeLabel(type: CombatantType): string {
  return TYPE_LABELS[type];
}
