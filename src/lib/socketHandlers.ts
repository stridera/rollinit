import type { Server, Socket } from "socket.io";
import { prisma } from "./db";
import { parseDiceNotation, rollDice } from "./dice";
import { generateJoinCode } from "./joinCode";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SessionState,
  EncounterWithCombatants,
} from "@/types/socket";

type IO = Server<ClientToServerEvents, ServerToClientEvents>;
type SocketInstance = Socket<ClientToServerEvents, ServerToClientEvents>;

function capitalizeFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Dead PCs/NPCs/Companions stay in turn order for death saves; dead monsters do not
function isInTurnOrder(ec: { isActive: boolean; combatant: { type: string } }): boolean {
  return ec.isActive || ec.combatant.type !== "MONSTER";
}

async function getSessionState(joinCode: string): Promise<SessionState | null> {
  const session = await prisma.session.findUnique({
    where: { joinCode },
    include: {
      combatants: {
        include: { encounterCombatants: true },
        orderBy: { createdAt: "asc" },
      },
      encounters: {
        include: {
          combatants: {
            include: { combatant: true },
            orderBy: { sortOrder: "asc" },
          },
        },
        orderBy: { createdAt: "asc" },
      },
      diceRolls: {
        orderBy: { createdAt: "desc" },
        take: 50,
      },
    },
  });

  if (!session) return null;

  // Use stored selection, falling back to most recent non-COMPLETED
  const activeEncounterId =
    session.activeEncounterId &&
    session.encounters.some((e) => e.id === session.activeEncounterId)
      ? session.activeEncounterId
      : [...session.encounters].reverse().find((e) => e.status !== "COMPLETED")?.id ?? null;

  return {
    joinCode: session.joinCode,
    isLocked: session.isLocked,
    hasPassword: session.password != null,
    physicalDice: session.physicalDice,
    showMonsterHpBar: session.showMonsterHpBar,
    combatants: session.combatants,
    encounters: session.encounters,
    activeEncounterId,
    diceRolls: session.diceRolls,
  };
}

function filterStateForPlayers(state: SessionState): SessionState {
  return {
    ...state,
    combatants: state.combatants.filter((c) => !c.isHidden),
    encounters: state.encounters.map((enc) => ({
      ...enc,
      combatants: enc.combatants.filter((ec) => !ec.isHidden),
    })),
    diceRolls: state.diceRolls.filter((r) => !r.isPrivate),
  };
}

async function reassignSortOrder(encounterId: string) {
  const combatants = await prisma.encounterCombatant.findMany({
    where: { encounterId },
    include: { combatant: true },
  });

  const sorted = [...combatants].sort((a, b) => {
    const initA = a.initiative ?? -Infinity;
    const initB = b.initiative ?? -Infinity;
    if (initB !== initA) return initB - initA;
    // PCs/Companions win ties
    const aIsPC = a.combatant.type === "PLAYER_CHARACTER" || a.combatant.type === "COMPANION" ? 0 : 1;
    const bIsPC = b.combatant.type === "PLAYER_CHARACTER" || b.combatant.type === "COMPANION" ? 0 : 1;
    if (aIsPC !== bIsPC) return aIsPC - bIsPC;
    return b.initiativeBonus - a.initiativeBonus;
  });

  await prisma.$transaction(
    sorted.map((c, idx) =>
      prisma.encounterCombatant.update({
        where: { id: c.id },
        data: { sortOrder: idx },
      })
    )
  );
}

async function broadcastViewerCount(io: IO, joinCode: string) {
  const sessionSockets = await io.in(`session:${joinCode}`).fetchSockets();
  const dmSockets = await io.in(`dm:${joinCode}`).fetchSockets();
  const dmSocketIds = new Set(dmSockets.map((s) => s.id));

  const combatants = await prisma.combatant.findMany({
    where: { session: { joinCode }, playerSocketId: { not: null } },
    select: { playerSocketId: true },
  });
  const playerSocketIds = new Set(combatants.map((c) => c.playerSocketId));

  let players = 0;
  let spectators = 0;
  for (const s of sessionSockets) {
    if (dmSocketIds.has(s.id)) continue;
    if (playerSocketIds.has(s.id)) {
      players++;
    } else {
      spectators++;
    }
  }

  const data = { spectators, players };
  io.to(`session:${joinCode}`).emit("session:viewerCount", data);
  io.to(`dm:${joinCode}`).emit("session:viewerCount", data);
}

export function registerSocketHandlers(io: IO, socket: SocketInstance) {
  // --- Session ---
  socket.on("session:join", async ({ joinCode, isDM }) => {
    const session = await prisma.session.findUnique({
      where: { joinCode },
    });
    if (!session) {
      socket.emit("error", "Session not found");
      return;
    }

    socket.join(`session:${joinCode}`);
    socket.data.joinCodes = socket.data.joinCodes || new Set<string>();
    socket.data.joinCodes.add(joinCode);

    if (isDM) {
      socket.join(`dm:${joinCode}`);
      socket.data.dmCodes = socket.data.dmCodes || new Set<string>();
      socket.data.dmCodes.add(joinCode);

      // Update last active timestamp
      await prisma.session.update({
        where: { joinCode },
        data: { lastActiveAt: new Date() },
      });

      const state = await getSessionState(joinCode);
      if (state) {
        socket.emit("session:state", state);
        // Broadcast to players that DM is now active + send them state
        const playerState = filterStateForPlayers(state);
        socket.to(`session:${joinCode}`).emit("session:state", playerState);
      }
      io.to(`session:${joinCode}`).emit("session:dmStatus", { active: true });
    } else {
      // Check if DM is currently connected
      const dmSockets = await io.in(`dm:${joinCode}`).fetchSockets();
      const dmActive = dmSockets.length > 0;
      socket.emit("session:dmStatus", { active: dmActive });

      if (dmActive) {
        const state = await getSessionState(joinCode);
        if (state) {
          socket.emit("session:state", filterStateForPlayers(state));
        }
      }
      // If DM not active, player waits — they'll get state when DM connects
    }

    broadcastViewerCount(io, joinCode);
  });

  socket.on("session:leave", async ({ joinCode }) => {
    const wasDM = socket.rooms.has(`dm:${joinCode}`);
    socket.leave(`session:${joinCode}`);
    socket.leave(`dm:${joinCode}`);
    socket.data.joinCodes?.delete(joinCode);
    socket.data.dmCodes?.delete(joinCode);

    if (wasDM) {
      const dmSockets = await io.in(`dm:${joinCode}`).fetchSockets();
      if (dmSockets.length === 0) {
        io.to(`session:${joinCode}`).emit("session:dmStatus", { active: false });
      }
    }

    broadcastViewerCount(io, joinCode);
  });

  // --- Combatants (templates) ---
  socket.on("combatant:add", async (data) => {
    const session = await prisma.session.findUnique({
      where: { joinCode: data.joinCode },
    });
    if (!session) return;

    // For companions, look up owner to inherit playerSocketId
    let playerSocketId: string | null = null;
    if (data.type === "COMPANION" && data.ownerId) {
      const owner = await prisma.combatant.findUnique({
        where: { id: data.ownerId },
        select: { playerSocketId: true },
      });
      playerSocketId = owner?.playerSocketId ?? null;
    }

    const combatant = await prisma.combatant.create({
      data: {
        name: capitalizeFirst(data.name),
        type: data.type,
        initiativeBonus: data.initiativeBonus,
        initiativeAdvantage: data.initiativeAdvantage ?? false,
        maxHp: data.maxHp,
        currentHp: data.maxHp,
        armorClass: data.armorClass,
        isHidden: data.isHidden,
        sessionId: session.id,
        ...(data.type === "COMPANION" && data.ownerId ? { ownerId: data.ownerId, playerSocketId } : {}),
      },
      include: { encounterCombatants: true },
    });

    io.to(`dm:${data.joinCode}`).emit("combatant:added", combatant);

    if (!combatant.isHidden) {
      socket.to(`session:${data.joinCode}`).emit("combatant:added", combatant);
    }
  });

  socket.on("combatant:update", async (data) => {
    const updates = { ...data.updates };
    if (updates.name) updates.name = capitalizeFirst(updates.name);
    const combatant = await prisma.combatant.update({
      where: { id: data.combatantId },
      data: updates,
      include: { encounterCombatants: true },
    });

    io.to(`dm:${data.joinCode}`).emit("combatant:updated", combatant);

    if (!combatant.isHidden) {
      socket
        .to(`session:${data.joinCode}`)
        .emit("combatant:updated", combatant);
    }
  });

  socket.on("combatant:remove", async (data) => {
    // Look up the combatant before deleting so we can disconnect the player
    // and find which encounters are affected
    const combatant = await prisma.combatant.findUnique({
      where: { id: data.combatantId },
      include: { encounterCombatants: true, session: true },
    });
    if (!combatant) return;

    // For each active encounter, snapshot the old active list so we can
    // fix currentTurnIdx after the cascade delete
    const affectedEncounters: Array<{
      encounterId: string;
      oldActiveIds: string[];   // entry IDs in sort order
      oldTurnIdx: number;
    }> = [];

    for (const ec of combatant.encounterCombatants) {
      // Only need special handling for encounters that are ACTIVE
      if (!affectedEncounters.some((a) => a.encounterId === ec.encounterId)) {
        const enc = await prisma.encounter.findUnique({
          where: { id: ec.encounterId },
          include: {
            combatants: {
              include: { combatant: true },
              orderBy: { sortOrder: "asc" },
            },
          },
        });
        if (enc) {
          affectedEncounters.push({
            encounterId: enc.id,
            oldActiveIds: enc.combatants.filter(isInTurnOrder).map((c) => c.id),
            oldTurnIdx: enc.status === "ACTIVE" ? enc.currentTurnIdx : -1,
          });
        }
      }
    }

    await prisma.combatant.delete({ where: { id: data.combatantId } });
    io.to(`session:${data.joinCode}`).emit("combatant:removed", data.combatantId);
    io.to(`dm:${data.joinCode}`).emit("combatant:removed", data.combatantId);

    // Broadcast updated encounter state and fix turn index
    for (const { encounterId, oldActiveIds, oldTurnIdx } of affectedEncounters) {
      const encounter = await prisma.encounter.findUnique({
        where: { id: encounterId },
        include: {
          combatants: {
            include: { combatant: true },
            orderBy: { sortOrder: "asc" },
          },
        },
      });
      if (!encounter) continue;

      if (encounter.status === "ACTIVE" && oldTurnIdx >= 0) {
        const newActiveIds = encounter.combatants
          .filter(isInTurnOrder)
          .map((ec) => ec.id);
        const oldCurrentId = oldActiveIds[oldTurnIdx];
        let newIdx: number;

        if (oldCurrentId && newActiveIds.includes(oldCurrentId)) {
          // Current turn combatant still exists — find its new index
          newIdx = newActiveIds.indexOf(oldCurrentId);
        } else {
          // Current turn combatant was removed — advance to whoever was next
          // Walk forward from old position to find the first surviving entry
          newIdx = 0;
          for (let i = 1; i <= oldActiveIds.length; i++) {
            const candidateId = oldActiveIds[(oldTurnIdx + i) % oldActiveIds.length];
            const found = newActiveIds.indexOf(candidateId);
            if (found >= 0) {
              newIdx = found;
              break;
            }
          }
        }

        // Clamp
        if (newActiveIds.length > 0) {
          newIdx = Math.min(newIdx, newActiveIds.length - 1);
        } else {
          newIdx = 0;
        }

        if (newIdx !== encounter.currentTurnIdx) {
          await prisma.encounter.update({
            where: { id: encounterId },
            data: { currentTurnIdx: newIdx },
          });
          encounter.currentTurnIdx = newIdx;
        }

        // Notify the new current-turn combatant
        notifyCurrentTurn(io, data.joinCode, encounter);
      }

      emitEncounterUpdate(io, data.joinCode, encounter, "encounter:updated");
    }

    // If this was a PC with a connected player, notify them (keep connection alive so they can rejoin)
    if (combatant.playerSocketId) {
      const playerSocket = io.sockets.sockets.get(combatant.playerSocketId);
      if (playerSocket) {
        playerSocket.emit("player:removed");
      }
    }

    broadcastViewerCount(io, data.joinCode);
  });

  // --- Encounters ---
  socket.on("encounter:create", async (data) => {
    const session = await prisma.session.findUnique({
      where: { joinCode: data.joinCode },
    });
    if (!session) return;

    // Get all PCs/NPCs/Companions that auto-join and aren't excluded
    const allAutoJoin = await prisma.combatant.findMany({
      where: {
        sessionId: session.id,
        type: { in: ["PLAYER_CHARACTER", "NPC", "COMPANION"] },
        autoJoin: true,
      },
    });

    const autoJoinCombatants = allAutoJoin.filter(
      (c) => (c.type === "PLAYER_CHARACTER" || c.type === "NPC") && !data.excludePcIds.includes(c.id)
    );

    // Companions of auto-joining PCs
    const autoJoinPcIds = new Set(
      autoJoinCombatants.filter((c) => c.type === "PLAYER_CHARACTER").map((c) => c.id)
    );
    const companions = allAutoJoin.filter(
      (c) => c.type === "COMPANION" && c.ownerId && autoJoinPcIds.has(c.ownerId)
    );

    // Build encounter combatant create data
    const instanceData: Array<{
      displayName: string;
      currentHp: number;
      maxHp: number;
      tempHp: number;
      armorClass: number;
      initiativeBonus: number;
      initiativeAdvantage: boolean;
      conditions: string[];
      isHidden: boolean;
      combatantId: string;
      sortOrder: number;
    }> = [];

    let sortOrder = 0;

    // Add PCs/NPCs — one instance each, copying current HP and temp HP
    for (const c of autoJoinCombatants) {
      instanceData.push({
        displayName: c.name,
        currentHp: c.currentHp,
        maxHp: c.maxHp,
        tempHp: c.tempHp,
        armorClass: c.armorClass,
        initiativeBonus: c.initiativeBonus,
        initiativeAdvantage: c.initiativeAdvantage,
        conditions: [...c.conditions],
        isHidden: c.isHidden,
        combatantId: c.id,
        sortOrder: sortOrder++,
      });
    }

    // Add companions
    for (const c of companions) {
      instanceData.push({
        displayName: c.name,
        currentHp: c.currentHp,
        maxHp: c.maxHp,
        tempHp: c.tempHp,
        armorClass: c.armorClass,
        initiativeBonus: c.initiativeBonus,
        initiativeAdvantage: c.initiativeAdvantage,
        conditions: [...c.conditions],
        isHidden: c.isHidden,
        combatantId: c.id,
        sortOrder: sortOrder++,
      });
    }

    // Compute total count per combatantId for proper naming
    const totalPerTemplate: Record<string, number> = {};
    for (const entry of data.monsters) {
      totalPerTemplate[entry.combatantId] =
        (totalPerTemplate[entry.combatantId] ?? 0) + entry.count;
    }

    // Add monster instances from template with counts
    const monsterIndexes: Record<string, number> = {};
    for (const entry of data.monsters) {
      const template = await prisma.combatant.findUnique({
        where: { id: entry.combatantId },
      });
      if (!template) continue;

      const idx = monsterIndexes[entry.combatantId] ?? 0;
      const total = totalPerTemplate[entry.combatantId] ?? 0;

      for (let i = 0; i < entry.count; i++) {
        const displayName =
          total === 1 ? template.name : `${template.name} ${idx + i + 1}`;
        instanceData.push({
          displayName,
          currentHp: template.maxHp,
          maxHp: template.maxHp,
          tempHp: 0,
          armorClass: template.armorClass,
          initiativeBonus: template.initiativeBonus,
          initiativeAdvantage: template.initiativeAdvantage,
          conditions: [],
          isHidden: entry.isHidden,
          combatantId: template.id,
          sortOrder: sortOrder++,
        });
      }

      monsterIndexes[entry.combatantId] = idx + entry.count;
    }

    const encounter = await prisma.encounter.create({
      data: {
        name: capitalizeFirst(data.name),
        sessionId: session.id,
        combatants: {
          create: instanceData,
        },
      },
      include: {
        combatants: {
          include: { combatant: true },
        },
      },
    });

    // Auto-select the newly created encounter
    await prisma.session.update({
      where: { id: session.id },
      data: { activeEncounterId: encounter.id },
    });

    emitEncounterUpdate(io, data.joinCode, encounter, "encounter:created");
  });

  socket.on("encounter:select", async (data) => {
    await prisma.session.update({
      where: { joinCode: data.joinCode },
      data: { activeEncounterId: data.encounterId },
    });

    const state = await getSessionState(data.joinCode);
    if (!state) return;

    io.to(`dm:${data.joinCode}`).emit("session:state", state);
    io.to(`session:${data.joinCode}`)
      .except(`dm:${data.joinCode}`)
      .emit("session:state", filterStateForPlayers(state));
  });

  // --- Instance Updates ---
  socket.on("instance:update", async (data) => {
    const instance = await prisma.encounterCombatant.update({
      where: { id: data.instanceId },
      data: data.updates,
      include: { combatant: true },
    });

    // Auto-death: HP hits 0 → mark inactive
    if (instance.currentHp <= 0 && instance.isActive) {
      await prisma.encounterCombatant.update({
        where: { id: instance.id },
        data: { isActive: false },
      });
    }

    // Auto-revive: HP goes above 0 → mark active
    if (instance.currentHp > 0 && !instance.isActive) {
      await prisma.encounterCombatant.update({
        where: { id: instance.id },
        data: { isActive: true },
      });
    }

    // PC/Companion sync-back: update session-level combatant HP and temp HP
    if (
      (data.updates.currentHp !== undefined || data.updates.tempHp !== undefined) &&
      (instance.combatant.type === "PLAYER_CHARACTER" || instance.combatant.type === "COMPANION")
    ) {
      const syncData: Record<string, number> = {};
      if (data.updates.currentHp !== undefined) syncData.currentHp = data.updates.currentHp;
      if (data.updates.tempHp !== undefined) syncData.tempHp = data.updates.tempHp;

      const updated = await prisma.combatant.update({
        where: { id: instance.combatantId },
        data: syncData,
        include: { encounterCombatants: true },
      });

      io.to(`dm:${data.joinCode}`).emit("combatant:updated", updated);
      if (!updated.isHidden) {
        socket
          .to(`session:${data.joinCode}`)
          .emit("combatant:updated", updated);
      }
    }

    // Broadcast updated encounter
    const encounter = await prisma.encounter.findUnique({
      where: { id: data.encounterId },
      include: {
        combatants: {
          include: { combatant: true },
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    if (encounter) {
      emitEncounterUpdate(io, data.joinCode, encounter, "encounter:updated");
    }
  });

  // --- Combat Flow ---
  socket.on("combat:startRolling", async (data) => {
    const encounter = await prisma.encounter.update({
      where: { id: data.encounterId },
      data: { status: "ROLLING" },
      include: {
        combatants: { include: { combatant: true } },
      },
    });

    emitEncounterUpdate(io, data.joinCode, encounter, "encounter:updated");
  });

  socket.on("combat:rollInitiative", async (data) => {
    const instance = await prisma.encounterCombatant.findUnique({
      where: { id: data.instanceId },
      include: { encounter: { include: { session: true } }, combatant: true },
    });

    if (!instance) return;

    // Authorization: non-DM sockets can only roll for their own combatant or companion
    // (companions have playerSocketId synced to the owner's socket)
    const isDM = socket.rooms.has(`dm:${data.joinCode}`);
    if (!isDM) {
      if (instance.combatant.playerSocketId !== socket.id) {
        socket.emit("error", "You can only roll initiative for your own character");
        return;
      }
      // Players can only set manual values when physical dice mode is enabled
      if (data.value !== undefined) {
        if (!instance.encounter.session.physicalDice) {
          socket.emit("error", "Only the DM can set manual initiative values");
          return;
        }
        // Validate the value is an integer 1-20
        if (!Number.isInteger(data.value) || data.value < 1 || data.value > 20) {
          socket.emit("error", "Manual roll must be an integer between 1 and 20");
          return;
        }
      }
    }

    let roll: number;
    let rolls: number[];
    if (data.value !== undefined) {
      roll = data.value;
      rolls = [roll];
    } else if (instance.initiativeAdvantage) {
      const r1 = Math.floor(Math.random() * 20) + 1;
      const r2 = Math.floor(Math.random() * 20) + 1;
      roll = Math.max(r1, r2);
      rolls = [r1, r2];
    } else {
      roll = Math.floor(Math.random() * 20) + 1;
      rolls = [roll];
    }
    const total = roll + instance.initiativeBonus;

    await prisma.encounterCombatant.update({
      where: { id: data.instanceId },
      data: { initiative: total },
    });

    // Log initiative roll to dice log
    const notation = instance.initiativeAdvantage && data.value === undefined
      ? `2d20kh1${instance.initiativeBonus >= 0 ? "+" : ""}${instance.initiativeBonus}`
      : `1d20${instance.initiativeBonus >= 0 ? "+" : ""}${instance.initiativeBonus}`;
    const diceRoll = await prisma.diceRoll.create({
      data: {
        notation,
        rolls,
        modifier: instance.initiativeBonus,
        total,
        rollerName: `${instance.displayName} (Initiative)`,
        isPrivate: instance.isHidden,
        sessionId: instance.encounter.sessionId,
      },
    });

    io.to(`dm:${data.joinCode}`).emit("dice:result", diceRoll);
    if (!instance.isHidden) {
      io.to(`session:${data.joinCode}`)
        .except(`dm:${data.joinCode}`)
        .emit("dice:result", diceRoll);
    }

    // Reassign sortOrder based on current initiative values
    await reassignSortOrder(data.encounterId);

    const encounter = await prisma.encounter.findUnique({
      where: { id: data.encounterId },
      include: {
        combatants: {
          include: { combatant: true },
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    if (encounter) {
      emitEncounterUpdate(io, data.joinCode, encounter, "encounter:updated");
    }
  });

  socket.on("combat:rollAll", async (data) => {
    const instances = await prisma.encounterCombatant.findMany({
      where: {
        encounterId: data.encounterId,
        initiative: null,
      },
      include: { encounter: true },
    });

    for (const instance of instances) {
      let roll: number;
      let rolls: number[];
      if (instance.initiativeAdvantage) {
        const r1 = Math.floor(Math.random() * 20) + 1;
        const r2 = Math.floor(Math.random() * 20) + 1;
        roll = Math.max(r1, r2);
        rolls = [r1, r2];
      } else {
        roll = Math.floor(Math.random() * 20) + 1;
        rolls = [roll];
      }
      const total = roll + instance.initiativeBonus;
      await prisma.encounterCombatant.update({
        where: { id: instance.id },
        data: { initiative: total },
      });

      // Log initiative roll to dice log
      const notation = instance.initiativeAdvantage
        ? `2d20kh1${instance.initiativeBonus >= 0 ? "+" : ""}${instance.initiativeBonus}`
        : `1d20${instance.initiativeBonus >= 0 ? "+" : ""}${instance.initiativeBonus}`;
      const diceRoll = await prisma.diceRoll.create({
        data: {
          notation,
          rolls,
          modifier: instance.initiativeBonus,
          total,
          rollerName: `${instance.displayName} (Initiative)`,
          isPrivate: instance.isHidden,
          sessionId: instance.encounter.sessionId,
        },
      });

      io.to(`dm:${data.joinCode}`).emit("dice:result", diceRoll);
      if (!instance.isHidden) {
        io.to(`session:${data.joinCode}`)
          .except(`dm:${data.joinCode}`)
          .emit("dice:result", diceRoll);
      }
    }

    // Reassign sortOrder based on current initiative values
    await reassignSortOrder(data.encounterId);

    const encounter = await prisma.encounter.findUnique({
      where: { id: data.encounterId },
      include: {
        combatants: {
          include: { combatant: true },
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    if (encounter) {
      emitEncounterUpdate(io, data.joinCode, encounter, "encounter:updated");
    }
  });

  socket.on("combat:start", async (data) => {
    await reassignSortOrder(data.encounterId);

    const encounter = await prisma.encounter.update({
      where: { id: data.encounterId },
      data: { status: "ACTIVE", currentTurnIdx: 0, roundNumber: 1 },
      include: {
        combatants: {
          include: { combatant: true },
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    emitEncounterUpdate(io, data.joinCode, encounter, "combat:started");
    notifyCurrentTurn(io, data.joinCode, encounter);
  });

  socket.on("combat:nextTurn", async (data) => {
    const encounter = await prisma.encounter.findUnique({
      where: { id: data.encounterId },
      include: {
        combatants: {
          include: { combatant: true },
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    if (!encounter) return;
    const turnOrder = encounter.combatants.filter(isInTurnOrder);
    if (turnOrder.length === 0) return;

    let nextIdx = encounter.currentTurnIdx + 1;
    let roundNumber = encounter.roundNumber;

    if (nextIdx >= turnOrder.length) {
      nextIdx = 0;
      roundNumber++;
    }

    const updated = await prisma.encounter.update({
      where: { id: data.encounterId },
      data: { currentTurnIdx: nextIdx, roundNumber },
      include: {
        combatants: {
          include: { combatant: true },
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    emitEncounterUpdate(io, data.joinCode, updated, "combat:turnChanged");
    notifyCurrentTurn(io, data.joinCode, updated);
  });

  socket.on("combat:prevTurn", async (data) => {
    const encounter = await prisma.encounter.findUnique({
      where: { id: data.encounterId },
      include: {
        combatants: {
          include: { combatant: true },
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    if (!encounter) return;
    const turnOrder = encounter.combatants.filter(isInTurnOrder);
    if (turnOrder.length === 0) return;

    let prevIdx = encounter.currentTurnIdx - 1;
    let roundNumber = encounter.roundNumber;

    if (prevIdx < 0) {
      prevIdx = turnOrder.length - 1;
      roundNumber = Math.max(1, roundNumber - 1);
    }

    const updated = await prisma.encounter.update({
      where: { id: data.encounterId },
      data: { currentTurnIdx: prevIdx, roundNumber },
      include: {
        combatants: {
          include: { combatant: true },
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    emitEncounterUpdate(io, data.joinCode, updated, "combat:turnChanged");
    notifyCurrentTurn(io, data.joinCode, updated);
  });

  socket.on("combat:toggleActive", async (data) => {
    const instance = await prisma.encounterCombatant.findUnique({
      where: { id: data.instanceId },
    });

    if (!instance) return;

    await prisma.encounterCombatant.update({
      where: { id: instance.id },
      data: { isActive: !instance.isActive },
    });

    const encounter = await prisma.encounter.findUnique({
      where: { id: data.encounterId },
      include: {
        combatants: {
          include: { combatant: true },
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    if (encounter) {
      emitEncounterUpdate(io, data.joinCode, encounter, "encounter:updated");
    }
  });

  socket.on("combat:reorder", async (data) => {
    const allCombatants = await prisma.encounterCombatant.findMany({
      where: { encounterId: data.encounterId },
      include: { combatant: true },
      orderBy: { sortOrder: "asc" },
    });
    const combatants = allCombatants.filter(isInTurnOrder);

    const draggedIdx = combatants.findIndex((c) => c.id === data.instanceId);
    if (draggedIdx === -1) return;

    const [dragged] = combatants.splice(draggedIdx, 1);
    combatants.splice(data.newIndex, 0, dragged);

    await prisma.$transaction(
      combatants.map((c, idx) =>
        prisma.encounterCombatant.update({
          where: { id: c.id },
          data: { sortOrder: idx },
        })
      )
    );

    const encounter = await prisma.encounter.findUnique({
      where: { id: data.encounterId },
      include: {
        combatants: {
          include: { combatant: true },
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    if (encounter) {
      emitEncounterUpdate(io, data.joinCode, encounter, "encounter:updated");
    }
  });

  socket.on("combat:end", async (data) => {
    const [encounter] = await Promise.all([
      prisma.encounter.update({
        where: { id: data.encounterId },
        data: { status: "COMPLETED" },
        include: {
          combatants: {
            include: { combatant: true },
            orderBy: { sortOrder: "asc" },
          },
        },
      }),
      // Clear stored selection so it falls back to next non-completed
      prisma.session.update({
        where: { joinCode: data.joinCode },
        data: { activeEncounterId: null },
      }),
    ]);

    emitEncounterUpdate(io, data.joinCode, encounter, "combat:ended");
  });

  // --- Delete Encounter ---
  socket.on("encounter:delete", async (data) => {
    try {
      // Clear stored selection if deleting the active encounter
      await prisma.session.updateMany({
        where: { joinCode: data.joinCode, activeEncounterId: data.encounterId },
        data: { activeEncounterId: null },
      });

      await prisma.encounter.delete({
        where: { id: data.encounterId },
      });

      io.to(`dm:${data.joinCode}`).emit("encounter:deleted", data.encounterId);
      io.to(`session:${data.joinCode}`).emit("encounter:deleted", data.encounterId);
    } catch (err) {
      console.error("[encounter:delete] Failed:", err);
      socket.emit("error", "Failed to delete encounter");
    }
  });

  // --- Rename Encounter ---
  socket.on("encounter:rename", async (data) => {
    try {
      const encounter = await prisma.encounter.update({
        where: { id: data.encounterId },
        data: { name: data.name },
        include: {
          combatants: { include: { combatant: true }, orderBy: { sortOrder: "asc" } },
        },
      });

      emitEncounterUpdate(io, data.joinCode, encounter, "encounter:updated");
    } catch (err) {
      console.error("[encounter:rename] Failed:", err);
      socket.emit("error", "Failed to rename encounter");
    }
  });

  // --- Add Combatant to Active Encounter ---
  socket.on("encounter:addCombatant", async (data) => {
    const encounter = await prisma.encounter.findUnique({
      where: { id: data.encounterId },
      include: {
        combatants: {
          include: { combatant: true },
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    if (!encounter) return;
    if (encounter.status !== "ACTIVE" && encounter.status !== "ROLLING") return;

    const template = await prisma.combatant.findUnique({
      where: { id: data.combatantId },
    });
    if (!template) return;

    const isPC = template.type === "PLAYER_CHARACTER" || template.type === "NPC" || template.type === "COMPANION";

    // PCs/NPCs/Companions can only be in an encounter once; monsters can be added multiple times
    if (isPC && encounter.combatants.some((ec) => ec.combatantId === data.combatantId)) return;

    const maxSortOrder = encounter.combatants.reduce(
      (max, ec) => Math.max(max, ec.sortOrder),
      -1
    );

    // For monsters, generate a numbered display name
    let displayName = template.name;
    if (!isPC) {
      const existingCount = encounter.combatants.filter(
        (ec) => ec.combatantId === data.combatantId
      ).length;
      displayName = `${template.name} ${existingCount + 1}`;
    }

    await prisma.encounterCombatant.create({
      data: {
        encounterId: data.encounterId,
        combatantId: data.combatantId,
        displayName,
        currentHp: isPC ? template.currentHp : template.maxHp,
        maxHp: template.maxHp,
        tempHp: isPC ? template.tempHp : 0,
        armorClass: template.armorClass,
        initiativeBonus: template.initiativeBonus,
        initiativeAdvantage: template.initiativeAdvantage,
        conditions: isPC ? [...template.conditions] : [],
        isHidden: template.isHidden,
        isActive: true,
        sortOrder: maxSortOrder + 1,
      },
    });

    const updated = await prisma.encounter.findUnique({
      where: { id: data.encounterId },
      include: {
        combatants: {
          include: { combatant: true },
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    if (updated) {
      emitEncounterUpdate(io, data.joinCode, updated, "encounter:updated");
    }
  });

  // --- Session Management ---
  socket.on("session:toggleLock", async (data) => {
    const session = await prisma.session.findUnique({
      where: { joinCode: data.joinCode },
    });
    if (!session || session.dmToken !== data.dmToken) {
      socket.emit("error", "Unauthorized");
      return;
    }

    const updated = await prisma.session.update({
      where: { id: session.id },
      data: { isLocked: !session.isLocked },
    });

    io.to(`session:${data.joinCode}`).emit("session:lockChanged", {
      isLocked: updated.isLocked,
    });
    io.to(`dm:${data.joinCode}`).emit("session:lockChanged", {
      isLocked: updated.isLocked,
    });
  });

  socket.on("session:regenerateCode", async (data) => {
    const session = await prisma.session.findUnique({
      where: { joinCode: data.joinCode },
    });
    if (!session || session.dmToken !== data.dmToken) {
      socket.emit("error", "Unauthorized");
      return;
    }

    // Generate a new unique code
    let newCode: string;
    try {
      const usedCodes = new Set(
        (await prisma.session.findMany({ select: { joinCode: true } })).map(
          (s) => s.joinCode
        )
      );
      newCode = generateJoinCode(usedCodes);
    } catch {
      socket.emit("error", "Failed to generate unique code");
      return;
    }

    const oldCode = data.joinCode;

    await prisma.session.update({
      where: { id: session.id },
      data: { joinCode: newCode },
    });

    // Notify DM room of the new code
    io.to(`dm:${oldCode}`).emit("session:codeRegenerated", {
      newJoinCode: newCode,
    });

    // Kick player sockets (those in session room but not DM room)
    const sessionSockets = await io.in(`session:${oldCode}`).fetchSockets();
    const dmSockets = await io.in(`dm:${oldCode}`).fetchSockets();
    const dmSocketIds = new Set(dmSockets.map((s) => s.id));

    for (const s of sessionSockets) {
      if (!dmSocketIds.has(s.id)) {
        s.leave(`session:${oldCode}`);
        s.emit("error", "Session code has been changed — please rejoin with the new code");
        s.disconnect(true);
      }
    }

    // Move DM sockets to new rooms
    for (const s of dmSockets) {
      s.leave(`session:${oldCode}`);
      s.leave(`dm:${oldCode}`);
      s.join(`session:${newCode}`);
      s.join(`dm:${newCode}`);
    }
  });

  // --- Session Settings ---
  socket.on("session:getSettings", async (data) => {
    const session = await prisma.session.findUnique({
      where: { joinCode: data.joinCode },
    });
    if (!session || session.dmToken !== data.dmToken) {
      socket.emit("error", "Unauthorized");
      return;
    }
    socket.emit("session:dmSettings", {
      password: session.password,
      physicalDice: session.physicalDice,
      showMonsterHpBar: session.showMonsterHpBar,
    });
  });

  socket.on("session:updateSettings", async (data) => {
    const session = await prisma.session.findUnique({
      where: { joinCode: data.joinCode },
    });
    if (!session || session.dmToken !== data.dmToken) {
      socket.emit("error", "Unauthorized");
      return;
    }

    const updateData: { password?: string | null; physicalDice?: boolean; showMonsterHpBar?: boolean } = {};
    if (data.settings.password !== undefined) {
      updateData.password = data.settings.password || null;
    }
    if (data.settings.physicalDice !== undefined) {
      updateData.physicalDice = data.settings.physicalDice;
    }
    if (data.settings.showMonsterHpBar !== undefined) {
      updateData.showMonsterHpBar = data.settings.showMonsterHpBar;
    }

    const updated = await prisma.session.update({
      where: { id: session.id },
      data: updateData,
    });

    const settingsData = {
      hasPassword: updated.password != null,
      physicalDice: updated.physicalDice,
      showMonsterHpBar: updated.showMonsterHpBar,
    };
    io.to(`session:${data.joinCode}`).emit("session:settingsChanged", settingsData);
    io.to(`dm:${data.joinCode}`).emit("session:settingsChanged", settingsData);
  });

  socket.on("session:validatePassword", async (data) => {
    const session = await prisma.session.findUnique({
      where: { joinCode: data.joinCode },
    });
    if (!session) {
      socket.emit("error", "Session not found");
      return;
    }
    if (session.password && session.password !== data.password) {
      socket.emit("error", "Incorrect password");
      return;
    }
    socket.emit("session:passwordValid");
  });

  // --- Player Registration ---
  socket.on("player:register", async (data) => {
    const session = await prisma.session.findUnique({
      where: { joinCode: data.joinCode },
    });
    if (!session) {
      socket.emit("error", "Session not found");
      return;
    }

    // DM must be connected for players to register
    const dmSockets = await io.in(`dm:${data.joinCode}`).fetchSockets();
    if (dmSockets.length === 0) {
      socket.emit("error", "The DM is not currently connected");
      return;
    }

    if (session.isLocked) {
      socket.emit("error", "Session is locked");
      return;
    }

    // Look for existing PC with same name (case-insensitive)
    const existing = await prisma.combatant.findFirst({
      where: {
        sessionId: session.id,
        type: "PLAYER_CHARACTER",
        name: { equals: data.name, mode: "insensitive" },
      },
      include: { encounterCombatants: true },
    });

    if (existing) {
      // Claim existing PC
      const updated = await prisma.combatant.update({
        where: { id: existing.id },
        data: {
          playerSocketId: socket.id,
          maxHp: data.maxHp,
          armorClass: data.armorClass,
          initiativeBonus: data.initiativeBonus,
          initiativeAdvantage: data.initiativeAdvantage ?? false,
        },
        include: { encounterCombatants: true },
      });

      io.to(`dm:${data.joinCode}`).emit("combatant:updated", updated);
      if (!updated.isHidden) {
        socket.to(`session:${data.joinCode}`).emit("combatant:updated", updated);
      }

      socket.emit("player:registered", {
        combatantId: updated.id,
        name: updated.name,
      });
    } else {
      // Create new PC
      const combatant = await prisma.combatant.create({
        data: {
          name: capitalizeFirst(data.name),
          type: "PLAYER_CHARACTER",
          initiativeBonus: data.initiativeBonus,
          initiativeAdvantage: data.initiativeAdvantage ?? false,
          maxHp: data.maxHp,
          currentHp: data.maxHp,
          armorClass: data.armorClass,
          autoJoin: true,
          playerSocketId: socket.id,
          sessionId: session.id,
        },
        include: { encounterCombatants: true },
      });

      io.to(`dm:${data.joinCode}`).emit("combatant:added", combatant);
      socket.to(`session:${data.joinCode}`).emit("combatant:added", combatant);

      socket.emit("player:registered", {
        combatantId: combatant.id,
        name: combatant.name,
      });
    }

    broadcastViewerCount(io, data.joinCode);
  });

  socket.on("player:reconnect", async (data) => {
    const session = await prisma.session.findUnique({
      where: { joinCode: data.joinCode },
    });
    if (!session) {
      socket.emit("error", "Session not found");
      return;
    }

    const combatant = await prisma.combatant.findFirst({
      where: {
        id: data.combatantId,
        sessionId: session.id,
        type: "PLAYER_CHARACTER",
      },
      include: { encounterCombatants: true },
    });

    if (!combatant) {
      socket.emit("error", "Character not found — please register again");
      return;
    }

    const updated = await prisma.combatant.update({
      where: { id: combatant.id },
      data: { playerSocketId: socket.id },
      include: { encounterCombatants: true },
    });

    io.to(`dm:${data.joinCode}`).emit("combatant:updated", updated);
    if (!updated.isHidden) {
      socket.to(`session:${data.joinCode}`).emit("combatant:updated", updated);
    }

    // Update companion socketIds too
    const companionsList = await prisma.combatant.findMany({
      where: { ownerId: combatant.id, type: "COMPANION" },
    });
    for (const companion of companionsList) {
      const updatedCompanion = await prisma.combatant.update({
        where: { id: companion.id },
        data: { playerSocketId: socket.id },
        include: { encounterCombatants: true },
      });
      io.to(`dm:${data.joinCode}`).emit("combatant:updated", updatedCompanion);
      if (!updatedCompanion.isHidden) {
        socket.to(`session:${data.joinCode}`).emit("combatant:updated", updatedCompanion);
      }
    }

    socket.emit("player:registered", {
      combatantId: updated.id,
      name: updated.name,
    });

    broadcastViewerCount(io, data.joinCode);
  });

  // --- Companion Management ---
  socket.on("player:addCompanion", async (data) => {
    const session = await prisma.session.findUnique({
      where: { joinCode: data.joinCode },
    });
    if (!session) {
      socket.emit("error", "Session not found");
      return;
    }

    // Verify the owner exists and belongs to this player
    const owner = await prisma.combatant.findFirst({
      where: {
        id: data.ownerCombatantId,
        sessionId: session.id,
        type: "PLAYER_CHARACTER",
        playerSocketId: socket.id,
      },
    });
    if (!owner) {
      socket.emit("error", "You can only add companions to your own character");
      return;
    }

    const companion = await prisma.combatant.create({
      data: {
        name: capitalizeFirst(data.name),
        type: "COMPANION",
        initiativeBonus: data.initiativeBonus,
        maxHp: data.maxHp,
        currentHp: data.maxHp,
        armorClass: data.armorClass,
        autoJoin: true,
        playerSocketId: socket.id,
        ownerId: owner.id,
        sessionId: session.id,
      },
      include: { encounterCombatants: true },
    });

    io.to(`dm:${data.joinCode}`).emit("combatant:added", companion);
    socket.to(`session:${data.joinCode}`).emit("combatant:added", companion);
  });

  // --- Long Rest ---
  socket.on("session:longRest", async (data) => {
    try {
      // Heal all PCs, NPCs, and Companions to full HP
      const healed = await prisma.combatant.findMany({
        where: {
          session: { joinCode: data.joinCode },
          type: { in: ["PLAYER_CHARACTER", "NPC", "COMPANION"] },
        },
      });

      await prisma.$transaction(
        healed
          .filter((c) => c.currentHp < c.maxHp || c.tempHp > 0)
          .map((c) =>
            prisma.combatant.update({
              where: { id: c.id },
              data: { currentHp: c.maxHp, tempHp: 0 },
            })
          )
      );

      // Broadcast updated state to all clients
      const state = await getSessionState(data.joinCode);
      if (state) {
        io.to(`dm:${data.joinCode}`).emit("session:state", state);
        io.to(`session:${data.joinCode}`)
          .except(`dm:${data.joinCode}`)
          .emit("session:state", filterStateForPlayers(state));
      }
    } catch (err) {
      console.error("[session:longRest] Failed:", err);
      socket.emit("error", "Failed to perform long rest");
    }
  });

  // --- Disconnect cleanup ---
  socket.on("disconnect", async () => {
    // Broadcast DM status for any sessions where this was the DM
    const dmCodes = socket.data.dmCodes as Set<string> | undefined;
    if (dmCodes) {
      for (const joinCode of dmCodes) {
        const remainingDm = await io.in(`dm:${joinCode}`).fetchSockets();
        if (remainingDm.length === 0) {
          io.to(`session:${joinCode}`).emit("session:dmStatus", { active: false });
        }
      }
    }

    // Find all combatants this socket was linked to
    const linked = await prisma.combatant.findMany({
      where: { playerSocketId: socket.id },
      include: { encounterCombatants: true, session: true },
    });

    const affectedJoinCodes = new Set<string>(
      socket.data.joinCodes as Set<string> | undefined
    );

    for (const combatant of linked) {
      const updated = await prisma.combatant.update({
        where: { id: combatant.id },
        data: { playerSocketId: null },
        include: { encounterCombatants: true },
      });

      io.to(`dm:${combatant.session.joinCode}`).emit(
        "combatant:updated",
        updated
      );
      affectedJoinCodes.add(combatant.session.joinCode);
    }

    for (const jc of affectedJoinCodes) {
      broadcastViewerCount(io, jc);
    }
  });

  // --- Dice Rolling ---
  socket.on("dice:roll", async (data) => {
    const parsed = parseDiceNotation(data.notation);
    if (!parsed) {
      socket.emit("error", `Invalid dice notation: ${data.notation}`);
      return;
    }

    const session = await prisma.session.findUnique({
      where: { joinCode: data.joinCode },
    });
    if (!session) return;

    const { rolls, total } = rollDice(parsed);

    const diceRoll = await prisma.diceRoll.create({
      data: {
        notation: data.notation,
        rolls,
        modifier: parsed.modifier,
        total,
        rollerName: data.rollerName,
        isPrivate: data.isPrivate,
        sessionId: session.id,
      },
    });

    io.to(`dm:${data.joinCode}`).emit("dice:result", diceRoll);

    if (!data.isPrivate) {
      io.to(`session:${data.joinCode}`)
        .except(`dm:${data.joinCode}`)
        .emit("dice:result", diceRoll);
    }
  });
}

function emitEncounterUpdate(
  io: IO,
  joinCode: string,
  encounter: EncounterWithCombatants,
  event: "encounter:updated" | "encounter:created" | "combat:started" | "combat:turnChanged" | "combat:ended"
) {
  io.to(`dm:${joinCode}`).emit(event, encounter);

  // Filter hidden for players
  const playerView: EncounterWithCombatants = {
    ...encounter,
    combatants: encounter.combatants.filter((ec) => !ec.isHidden),
  };

  // Adjust currentTurnIdx for player view if needed
  if (encounter.status === "ACTIVE") {
    const turnOrderEntries = encounter.combatants.filter(isInTurnOrder);
    const currentEntry = turnOrderEntries[encounter.currentTurnIdx];
    if (currentEntry?.isHidden) {
      const visibleTurnOrder = turnOrderEntries.filter((ec) => !ec.isHidden);
      let adjustedIdx = encounter.currentTurnIdx - 1;
      while (adjustedIdx >= 0 && turnOrderEntries[adjustedIdx]?.isHidden) {
        adjustedIdx--;
      }
      if (adjustedIdx >= 0) {
        const visibleEntry = turnOrderEntries[adjustedIdx];
        playerView.currentTurnIdx = visibleTurnOrder.findIndex(
          (ec) => ec.id === visibleEntry.id
        );
      }
    } else if (currentEntry) {
      const visibleTurnOrder = playerView.combatants.filter(isInTurnOrder);
      playerView.currentTurnIdx = visibleTurnOrder.findIndex(
        (ec) => ec.id === currentEntry.id
      );
    }
  }

  io.to(`session:${joinCode}`)
    .except(`dm:${joinCode}`)
    .emit(event, playerView);
}

function notifyCurrentTurn(
  io: IO,
  joinCode: string,
  encounter: EncounterWithCombatants
) {
  const turnOrderEntries = encounter.combatants.filter(isInTurnOrder);
  const currentEntry = turnOrderEntries[encounter.currentTurnIdx];
  if (!currentEntry) return;

  // Notify player whose turn it is
  if (currentEntry.combatant.playerSocketId) {
    io.to(currentEntry.combatant.playerSocketId).emit(
      "notify:yourTurn",
      currentEntry.displayName
    );
  }
}
