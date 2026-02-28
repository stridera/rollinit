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

  // Find the active encounter (most recent non-COMPLETED)
  const activeEncounter = [...session.encounters]
    .reverse()
    .find((e) => e.status !== "COMPLETED");

  return {
    joinCode: session.joinCode,
    isLocked: session.isLocked,
    hasPassword: session.password != null,
    physicalDice: session.physicalDice,
    combatants: session.combatants,
    encounters: session.encounters,
    activeEncounterId: activeEncounter?.id ?? null,
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
    // PCs win ties
    const aIsPC = a.combatant.type === "PLAYER_CHARACTER" ? 0 : 1;
    const bIsPC = b.combatant.type === "PLAYER_CHARACTER" ? 0 : 1;
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
    if (isDM) socket.join(`dm:${joinCode}`);

    const state = await getSessionState(joinCode);
    if (!state) return;

    if (isDM) {
      socket.emit("session:state", state);
    } else {
      socket.emit("session:state", filterStateForPlayers(state));
    }

    broadcastViewerCount(io, joinCode);
  });

  socket.on("session:leave", ({ joinCode }) => {
    socket.leave(`session:${joinCode}`);
    socket.leave(`dm:${joinCode}`);
    broadcastViewerCount(io, joinCode);
  });

  // --- Combatants (templates) ---
  socket.on("combatant:add", async (data) => {
    const session = await prisma.session.findUnique({
      where: { joinCode: data.joinCode },
    });
    if (!session) return;

    const combatant = await prisma.combatant.create({
      data: {
        name: capitalizeFirst(data.name),
        type: data.type,
        initiativeBonus: data.initiativeBonus,
        maxHp: data.maxHp,
        currentHp: data.maxHp,
        armorClass: data.armorClass,
        isHidden: data.isHidden,
        sessionId: session.id,
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
              where: { isActive: true },
              orderBy: { sortOrder: "asc" },
            },
          },
        });
        if (enc) {
          affectedEncounters.push({
            encounterId: enc.id,
            oldActiveIds: enc.combatants.map((c) => c.id),
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
          .filter((ec) => ec.isActive)
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

    // Get all PCs/NPCs that auto-join and aren't excluded
    const autoJoinCombatants = await prisma.combatant.findMany({
      where: {
        sessionId: session.id,
        type: { in: ["PLAYER_CHARACTER", "NPC"] },
        autoJoin: true,
        id: { notIn: data.excludePcIds },
      },
    });

    // Build encounter combatant create data
    const instanceData: Array<{
      displayName: string;
      currentHp: number;
      maxHp: number;
      armorClass: number;
      initiativeBonus: number;
      conditions: string[];
      isHidden: boolean;
      combatantId: string;
      sortOrder: number;
    }> = [];

    let sortOrder = 0;

    // Add PCs/NPCs — one instance each, copying current HP
    for (const c of autoJoinCombatants) {
      instanceData.push({
        displayName: c.name,
        currentHp: c.currentHp,
        maxHp: c.maxHp,
        armorClass: c.armorClass,
        initiativeBonus: c.initiativeBonus,
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
          armorClass: template.armorClass,
          initiativeBonus: template.initiativeBonus,
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

    emitEncounterUpdate(io, data.joinCode, encounter, "encounter:created");
  });

  socket.on("encounter:select", async (data) => {
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

    // PC HP sync-back: update session-level combatant HP
    if (
      data.updates.currentHp !== undefined &&
      instance.combatant.type === "PLAYER_CHARACTER"
    ) {
      const updated = await prisma.combatant.update({
        where: { id: instance.combatantId },
        data: { currentHp: data.updates.currentHp },
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

    // Authorization: non-DM sockets can only roll for their own combatant
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

    const roll = data.value ?? Math.floor(Math.random() * 20) + 1;
    const total = roll + instance.initiativeBonus;

    await prisma.encounterCombatant.update({
      where: { id: data.instanceId },
      data: { initiative: total },
    });

    // Log initiative roll to dice log
    const diceRoll = await prisma.diceRoll.create({
      data: {
        notation: `1d20${instance.initiativeBonus >= 0 ? "+" : ""}${instance.initiativeBonus}`,
        rolls: [roll],
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
      const roll = Math.floor(Math.random() * 20) + 1;
      const total = roll + instance.initiativeBonus;
      await prisma.encounterCombatant.update({
        where: { id: instance.id },
        data: { initiative: total },
      });

      // Log initiative roll to dice log
      const diceRoll = await prisma.diceRoll.create({
        data: {
          notation: `1d20${instance.initiativeBonus >= 0 ? "+" : ""}${instance.initiativeBonus}`,
          rolls: [roll],
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
          where: { isActive: true },
          include: { combatant: true },
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    if (!encounter || encounter.combatants.length === 0) return;

    let nextIdx = encounter.currentTurnIdx + 1;
    let roundNumber = encounter.roundNumber;

    if (nextIdx >= encounter.combatants.length) {
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
          where: { isActive: true },
          include: { combatant: true },
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    if (!encounter || encounter.combatants.length === 0) return;

    let prevIdx = encounter.currentTurnIdx - 1;
    let roundNumber = encounter.roundNumber;

    if (prevIdx < 0) {
      prevIdx = encounter.combatants.length - 1;
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
    const combatants = await prisma.encounterCombatant.findMany({
      where: { encounterId: data.encounterId, isActive: true },
      orderBy: { sortOrder: "asc" },
    });

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
    const encounter = await prisma.encounter.update({
      where: { id: data.encounterId },
      data: { status: "COMPLETED" },
      include: {
        combatants: {
          include: { combatant: true },
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    emitEncounterUpdate(io, data.joinCode, encounter, "combat:ended");
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

    const isPC = template.type === "PLAYER_CHARACTER" || template.type === "NPC";

    // PCs/NPCs can only be in an encounter once; monsters can be added multiple times
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
        armorClass: template.armorClass,
        initiativeBonus: template.initiativeBonus,
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
    let attempts = 0;
    do {
      newCode = generateJoinCode();
      const existing = await prisma.session.findUnique({
        where: { joinCode: newCode },
      });
      if (!existing) break;
      attempts++;
    } while (attempts < 10);

    if (attempts >= 10) {
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

    const updateData: { password?: string | null; physicalDice?: boolean } = {};
    if (data.settings.password !== undefined) {
      updateData.password = data.settings.password || null;
    }
    if (data.settings.physicalDice !== undefined) {
      updateData.physicalDice = data.settings.physicalDice;
    }

    const updated = await prisma.session.update({
      where: { id: session.id },
      data: updateData,
    });

    const settingsData = {
      hasPassword: updated.password != null,
      physicalDice: updated.physicalDice,
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

    socket.emit("player:registered", {
      combatantId: updated.id,
      name: updated.name,
    });

    broadcastViewerCount(io, data.joinCode);
  });

  // --- Disconnect cleanup ---
  socket.on("disconnect", async () => {
    // Find all combatants this socket was linked to
    const linked = await prisma.combatant.findMany({
      where: { playerSocketId: socket.id },
      include: { encounterCombatants: true, session: true },
    });

    const affectedJoinCodes = new Set<string>();

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
    const activeEntries = encounter.combatants.filter((ec) => ec.isActive);
    const currentEntry = activeEntries[encounter.currentTurnIdx];
    if (currentEntry?.isHidden) {
      const visibleActive = activeEntries.filter((ec) => !ec.isHidden);
      let adjustedIdx = encounter.currentTurnIdx - 1;
      while (adjustedIdx >= 0 && activeEntries[adjustedIdx]?.isHidden) {
        adjustedIdx--;
      }
      if (adjustedIdx >= 0) {
        const visibleEntry = activeEntries[adjustedIdx];
        playerView.currentTurnIdx = visibleActive.findIndex(
          (ec) => ec.id === visibleEntry.id
        );
      }
    } else if (currentEntry) {
      const visibleActive = playerView.combatants.filter(
        (ec) => ec.isActive
      );
      playerView.currentTurnIdx = visibleActive.findIndex(
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
  const activeEntries = encounter.combatants.filter((ec) => ec.isActive);
  const currentEntry = activeEntries[encounter.currentTurnIdx];
  if (!currentEntry) return;

  // Notify player whose turn it is
  if (currentEntry.combatant.playerSocketId) {
    io.to(currentEntry.combatant.playerSocketId).emit(
      "notify:yourTurn",
      currentEntry.displayName
    );
  }
}
