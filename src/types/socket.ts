import type {
  Combatant,
  CombatantType,
  DiceRoll,
  Encounter,
  EncounterCombatant,
  EncounterStatus,
} from "@prisma/client";

// Composite types for client consumption
export type CombatantWithInstances = Combatant & {
  encounterCombatants: EncounterCombatant[];
};

export type EncounterWithCombatants = Encounter & {
  combatants: (EncounterCombatant & {
    combatant: Combatant;
  })[];
};

export type SessionState = {
  joinCode: string;
  isLocked: boolean;
  combatants: CombatantWithInstances[];
  encounters: EncounterWithCombatants[];
  activeEncounterId: string | null;
  diceRolls: DiceRoll[];
};

// Socket event payloads
export type AddCombatantPayload = {
  joinCode: string;
  name: string;
  type: CombatantType;
  initiativeBonus: number;
  maxHp: number;
  armorClass: number;
  isHidden: boolean;
};

export type UpdateCombatantPayload = {
  joinCode: string;
  combatantId: string;
  updates: Partial<{
    name: string;
    initiativeBonus: number;
    maxHp: number;
    currentHp: number;
    armorClass: number;
    conditions: string[];
    isHidden: boolean;
    autoJoin: boolean;
    playerSocketId: string | null;
  }>;
};

export type RemoveCombatantPayload = {
  joinCode: string;
  combatantId: string;
};

export type MonsterEntry = {
  combatantId: string;
  count: number;
  isHidden: boolean;
};

export type CreateEncounterPayload = {
  joinCode: string;
  name: string;
  monsters: MonsterEntry[];
  excludePcIds: string[];
};

export type SelectEncounterPayload = {
  joinCode: string;
  encounterId: string;
};

export type StartRollingPayload = {
  joinCode: string;
  encounterId: string;
};

export type RollInitiativePayload = {
  joinCode: string;
  encounterId: string;
  instanceId: string;
  value?: number; // manual entry
};

export type RollAllPayload = {
  joinCode: string;
  encounterId: string;
};

export type StartCombatPayload = {
  joinCode: string;
  encounterId: string;
};

export type NextTurnPayload = {
  joinCode: string;
  encounterId: string;
};

export type PrevTurnPayload = {
  joinCode: string;
  encounterId: string;
};

export type ToggleActivePayload = {
  joinCode: string;
  encounterId: string;
  instanceId: string;
};

export type EndCombatPayload = {
  joinCode: string;
  encounterId: string;
};

export type ReorderPayload = {
  joinCode: string;
  encounterId: string;
  instanceId: string;
  newIndex: number;
};

export type UpdateInstancePayload = {
  joinCode: string;
  encounterId: string;
  instanceId: string;
  updates: Partial<{
    currentHp: number;
    conditions: string[];
    isHidden: boolean;
  }>;
};

export type AddToCombatPayload = {
  joinCode: string;
  encounterId: string;
  combatantId: string;
};

export type DiceRollPayload = {
  joinCode: string;
  notation: string;
  rollerName: string;
  isPrivate: boolean;
};

export type ToggleLockPayload = { joinCode: string; dmToken: string };
export type RegenerateCodePayload = { joinCode: string; dmToken: string };
export type PlayerRegisterPayload = {
  joinCode: string;
  name: string;
  maxHp: number;
  initiativeBonus: number;
  armorClass: number;
};
export type PlayerReconnectPayload = { joinCode: string; combatantId: string };

// Server -> Client events
export interface ServerToClientEvents {
  "session:state": (state: SessionState) => void;
  "session:playerState": (state: SessionState) => void;
  "session:lockChanged": (data: { isLocked: boolean }) => void;
  "session:codeRegenerated": (data: { newJoinCode: string }) => void;
  "combatant:added": (combatant: CombatantWithInstances) => void;
  "combatant:updated": (combatant: CombatantWithInstances) => void;
  "combatant:removed": (combatantId: string) => void;
  "encounter:created": (encounter: EncounterWithCombatants) => void;
  "encounter:updated": (encounter: EncounterWithCombatants) => void;
  "combat:started": (encounter: EncounterWithCombatants) => void;
  "combat:turnChanged": (encounter: EncounterWithCombatants) => void;
  "combat:ended": (encounter: EncounterWithCombatants) => void;
  "dice:result": (roll: DiceRoll) => void;
  "notify:yourTurn": (combatantName: string) => void;
  "player:registered": (data: { combatantId: string; name: string }) => void;
  "player:removed": () => void;
  "session:viewerCount": (data: { spectators: number; players: number }) => void;
  error: (message: string) => void;
}

// Client -> Server events
export interface ClientToServerEvents {
  "session:join": (data: { joinCode: string; isDM?: boolean }) => void;
  "session:leave": (data: { joinCode: string }) => void;
  "combatant:add": (data: AddCombatantPayload) => void;
  "combatant:update": (data: UpdateCombatantPayload) => void;
  "combatant:remove": (data: RemoveCombatantPayload) => void;
  "encounter:create": (data: CreateEncounterPayload) => void;
  "encounter:select": (data: SelectEncounterPayload) => void;
  "combat:startRolling": (data: StartRollingPayload) => void;
  "combat:rollInitiative": (data: RollInitiativePayload) => void;
  "combat:rollAll": (data: RollAllPayload) => void;
  "combat:start": (data: StartCombatPayload) => void;
  "combat:nextTurn": (data: NextTurnPayload) => void;
  "combat:prevTurn": (data: PrevTurnPayload) => void;
  "combat:toggleActive": (data: ToggleActivePayload) => void;
  "combat:end": (data: EndCombatPayload) => void;
  "combat:reorder": (data: ReorderPayload) => void;
  "instance:update": (data: UpdateInstancePayload) => void;
  "encounter:addCombatant": (data: AddToCombatPayload) => void;
  "dice:roll": (data: DiceRollPayload) => void;
  "session:toggleLock": (data: ToggleLockPayload) => void;
  "session:regenerateCode": (data: RegenerateCodePayload) => void;
  "player:register": (data: PlayerRegisterPayload) => void;
  "player:reconnect": (data: PlayerReconnectPayload) => void;
}
