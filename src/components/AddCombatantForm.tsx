"use client";

import { useState, useRef, useEffect } from "react";
import { Ghost, User, Plus, PawPrint } from "lucide-react";
import { NumericInput } from "./NumericInput";
import type { CombatantType } from "@prisma/client";
import type { ClientToServerEvents, CombatantWithInstances } from "@/types/socket";
import { AdvBadge } from "./AdvBadge";
import { SRD_MONSTERS, type SrdMonster } from "@/data/srd-monsters";

type EmitFn = <E extends keyof ClientToServerEvents>(
  event: E,
  ...args: Parameters<ClientToServerEvents[E]>
) => void;

export function AddCombatantForm({
  joinCode,
  emit,
  combatants,
}: {
  joinCode: string;
  emit: EmitFn;
  combatants?: CombatantWithInstances[];
}) {
  const [tab, setTab] = useState<"MONSTER" | "CHARACTER" | "COMPANION">("MONSTER");
  const [isNpc, setIsNpc] = useState(false);
  const [ownerId, setOwnerId] = useState("");
  const [name, setName] = useState("");
  const [initiativeBonus, setInitiativeBonus] = useState(0);
  const [maxHp, setMaxHp] = useState(10);
  const [armorClass, setArmorClass] = useState(10);
  const [initiativeAdvantage, setInitiativeAdvantage] = useState(false);
  const [search, setSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const searchResults =
    search.length >= 2
      ? SRD_MONSTERS.filter((m) =>
          m.name.toLowerCase().includes(search.toLowerCase())
        ).slice(0, 10)
      : [];

  // Close dropdown on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function selectMonster(monster: SrdMonster) {
    setName(monster.name);
    setMaxHp(monster.hp);
    setArmorClass(monster.ac);
    setInitiativeBonus(monster.initBonus);
    setSearch("");
    setShowDropdown(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    const type: CombatantType =
      tab === "MONSTER" ? "MONSTER"
      : tab === "COMPANION" ? "COMPANION"
      : isNpc ? "NPC"
      : "PLAYER_CHARACTER";

    emit("combatant:add", {
      joinCode,
      name: name.trim(),
      type,
      initiativeBonus,
      maxHp,
      armorClass,
      isHidden: false,
      initiativeAdvantage,
      ...(tab === "COMPANION" && ownerId ? { ownerId } : {}),
    });

    setName("");
    setInitiativeBonus(0);
    setMaxHp(10);
    setArmorClass(10);
    setInitiativeAdvantage(false);
    setSearch("");
    setOwnerId("");
  }

  return (
    <div className="card space-y-4">
      <h3 className="text-lg">Add Combatant</h3>

      {/* Tabs */}
      <div className="flex gap-1 bg-bg-tertiary rounded-lg p-1">
        <button
          className={`flex-1 py-1.5 px-3 rounded-md text-sm transition-colors flex items-center justify-center gap-1.5 ${
            tab === "MONSTER"
              ? "bg-bg-card text-accent-gold"
              : "text-text-muted hover:text-text-secondary"
          }`}
          onClick={() => setTab("MONSTER")}
        >
          <Ghost size={14} />
          Monster
        </button>
        <button
          className={`flex-1 py-1.5 px-3 rounded-md text-sm transition-colors flex items-center justify-center gap-1.5 ${
            tab === "CHARACTER"
              ? "bg-bg-card text-accent-gold"
              : "text-text-muted hover:text-text-secondary"
          }`}
          onClick={() => setTab("CHARACTER")}
        >
          <User size={14} />
          Character
        </button>
        <button
          className={`flex-1 py-1.5 px-3 rounded-md text-sm transition-colors flex items-center justify-center gap-1.5 ${
            tab === "COMPANION"
              ? "bg-bg-card text-accent-gold"
              : "text-text-muted hover:text-text-secondary"
          }`}
          onClick={() => setTab("COMPANION")}
        >
          <PawPrint size={14} />
          Companion
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        {/* SRD Monster Search */}
        {tab === "MONSTER" && (
          <div className="relative" ref={dropdownRef}>
            <input
              type="text"
              placeholder="Search SRD monsters..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setShowDropdown(true);
              }}
              onFocus={() => setShowDropdown(true)}
              className="w-full text-sm"
            />
            {showDropdown && searchResults.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-bg-card border border-border rounded-lg shadow-lg max-h-60 overflow-y-auto">
                {searchResults.map((m) => (
                  <button
                    key={m.name}
                    type="button"
                    onClick={() => selectMonster(m)}
                    className="w-full text-left px-3 py-2 hover:bg-bg-tertiary transition-colors text-sm"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{m.name}</span>
                      <span className="text-text-muted text-xs">
                        CR {m.cr}
                      </span>
                    </div>
                    <div className="text-text-muted text-xs">
                      {m.size} {m.type} &middot; AC {m.ac} &middot; HP {m.hp} &middot; Init{" "}
                      {m.initBonus >= 0 ? "+" : ""}
                      {m.initBonus}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* NPC toggle for character tab */}
        {tab === "CHARACTER" && (
          <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
            <input
              type="checkbox"
              checked={isNpc}
              onChange={(e) => setIsNpc(e.target.checked)}
              className="accent-accent-gold"
            />
            NPC (DM-controlled)
          </label>
        )}

        {/* Owner picker for companions */}
        {tab === "COMPANION" && (
          <div>
            <label className="text-xs text-text-muted block mb-1">Owner</label>
            <select
              value={ownerId}
              onChange={(e) => setOwnerId(e.target.value)}
              className="w-full text-sm"
            >
              <option value="">Select owner...</option>
              {(combatants ?? [])
                .filter((c) => c.type === "PLAYER_CHARACTER" || c.type === "NPC")
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </div>
        )}

        <input
          type="text"
          placeholder={tab === "COMPANION" ? "Familiar name" : tab === "MONSTER" ? "Goblin" : isNpc ? "Guard Captain" : "Gandalf"}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full"
        />

        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="text-xs text-text-muted block mb-1">
              Init Bonus
            </label>
            <NumericInput
              value={initiativeBonus}
              onChange={setInitiativeBonus}
              className="w-full text-center"
            />
          </div>
          <div>
            <label className="text-xs text-text-muted block mb-1">HP</label>
            <NumericInput
              value={maxHp}
              onChange={setMaxHp}
              defaultValue={10}
              min={1}
              className="w-full text-center"
            />
          </div>
          <div>
            <label className="text-xs text-text-muted block mb-1">AC</label>
            <NumericInput
              value={armorClass}
              onChange={setArmorClass}
              defaultValue={10}
              className="w-full text-center"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <AdvBadge
            active={initiativeAdvantage}
            onClick={() => setInitiativeAdvantage(!initiativeAdvantage)}
          />
          <span className="text-sm text-text-secondary">Initiative Advantage</span>
        </div>

        <button
          type="submit"
          className="btn btn-primary w-full"
          disabled={tab === "COMPANION" && !ownerId}
        >
          <Plus size={18} />
          Add {tab === "MONSTER" ? "Monster" : tab === "COMPANION" ? "Companion" : isNpc ? "NPC" : "Character"}
        </button>
      </form>
    </div>
  );
}
