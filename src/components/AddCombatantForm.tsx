"use client";

import { useState, useRef, useEffect } from "react";
import { Ghost, User, Plus } from "lucide-react";
import type { CombatantType } from "@prisma/client";
import type { ClientToServerEvents } from "@/types/socket";
import { SRD_MONSTERS, type SrdMonster } from "@/data/srd-monsters";

type EmitFn = <E extends keyof ClientToServerEvents>(
  event: E,
  ...args: Parameters<ClientToServerEvents[E]>
) => void;

export function AddCombatantForm({
  joinCode,
  emit,
}: {
  joinCode: string;
  emit: EmitFn;
}) {
  const [tab, setTab] = useState<"MONSTER" | "PLAYER_CHARACTER">("MONSTER");
  const [name, setName] = useState("");
  const [initiativeBonus, setInitiativeBonus] = useState(0);
  const [maxHp, setMaxHp] = useState(10);
  const [armorClass, setArmorClass] = useState(10);
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

    emit("combatant:add", {
      joinCode,
      name: name.trim(),
      type: tab as CombatantType,
      initiativeBonus,
      maxHp,
      armorClass,
      isHidden: false,
    });

    setName("");
    setInitiativeBonus(0);
    setMaxHp(10);
    setArmorClass(10);
    setSearch("");
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
            tab === "PLAYER_CHARACTER"
              ? "bg-bg-card text-accent-gold"
              : "text-text-muted hover:text-text-secondary"
          }`}
          onClick={() => setTab("PLAYER_CHARACTER")}
        >
          <User size={14} />
          Player Character
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

        <input
          type="text"
          placeholder={tab === "MONSTER" ? "Goblin" : "Gandalf"}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full"
        />

        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="text-xs text-text-muted block mb-1">
              Init Bonus
            </label>
            <input
              type="number"
              value={initiativeBonus}
              onChange={(e) => setInitiativeBonus(Number(e.target.value))}
              className="w-full text-center"
            />
          </div>
          <div>
            <label className="text-xs text-text-muted block mb-1">HP</label>
            <input
              type="number"
              value={maxHp}
              onChange={(e) => setMaxHp(Number(e.target.value))}
              min={1}
              className="w-full text-center"
            />
          </div>
          <div>
            <label className="text-xs text-text-muted block mb-1">AC</label>
            <input
              type="number"
              value={armorClass}
              onChange={(e) => setArmorClass(Number(e.target.value))}
              className="w-full text-center"
            />
          </div>
        </div>

        <button type="submit" className="btn btn-primary w-full">
          <Plus size={18} />
          Add {tab === "MONSTER" ? "Monster" : "Character"}
        </button>
      </form>
    </div>
  );
}
