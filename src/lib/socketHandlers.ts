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

    if (session.isLocked && !isDM) {
      socket.emit("error", "Session is locked — the DM has restricted new joins");
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
  });

  socket.on("session:leave", ({ joinCode }) => {
    socket.leave(`session:${joinCode}`);
    socket.leave(`dm:${joinCode}`);
  });

  // --- Combatants (templates) ---
  socket.on("combatant:add", async (data) => {
    const session = await prisma.session.findUnique({
      where: { joinCode: data.joinCode },
    });
    if (!session) return;

    const combatant = await prisma.combatant.create({
      data: {
        name: data.name,
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
    const combatant = await prisma.combatant.update({
      where: { id: data.combatantId },
      data: data.updates,
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
    await prisma.combatant.delete({ where: { id: data.combatantId } });
    io.to(`session:${data.joinCode}`).emit("combatant:removed", data.combatantId);
    io.to(`dm:${data.joinCode}`).emit("combatant:removed", data.combatantId);
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
        name: data.name,
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
      include: { encounter: true },
    });

    if (!instance) return;

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
          name: data.name,
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
  });

  // --- Disconnect cleanup ---
  socket.on("disconnect", async () => {
    // Find all combatants this socket was linked to
    const linked = await prisma.combatant.findMany({
      where: { playerSocketId: socket.id },
      include: { encounterCombatants: true, session: true },
    });

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
