import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "RollInit Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const WEEKS = 12;
const DAY_MS = 24 * 60 * 60 * 1000;

function startOfWeek(d: Date): Date {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  // Monday-start weeks
  const day = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - day);
  return date;
}

function formatDate(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function relativeTime(d: Date | null): string {
  if (!d) return "never";
  const diff = Date.now() - d.getTime();
  const days = Math.floor(diff / DAY_MS);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export default async function AdminPage({
  params,
}: {
  params: Promise<{ adminToken: string }>;
}) {
  const { adminToken } = await params;

  if (!process.env.ADMIN_TOKEN || adminToken !== process.env.ADMIN_TOKEN) {
    notFound();
  }

  const now = new Date();
  const d7 = new Date(now.getTime() - 7 * DAY_MS);
  const d30 = new Date(now.getTime() - 30 * DAY_MS);
  const chartStart = startOfWeek(new Date(now.getTime() - (WEEKS - 1) * 7 * DAY_MS));

  const [
    totalSessions,
    totalEncounters,
    totalCombatants,
    totalRolls,
    created7d,
    created30d,
    active7d,
    active30d,
    lastActive,
    recentCreated,
    recentSessions,
  ] = await Promise.all([
    prisma.session.count(),
    prisma.encounter.count(),
    prisma.combatant.count(),
    prisma.diceRoll.count(),
    prisma.session.count({ where: { createdAt: { gte: d7 } } }),
    prisma.session.count({ where: { createdAt: { gte: d30 } } }),
    prisma.session.count({ where: { lastActiveAt: { gte: d7 } } }),
    prisma.session.count({ where: { lastActiveAt: { gte: d30 } } }),
    prisma.session.aggregate({ _max: { lastActiveAt: true } }),
    prisma.session.findMany({
      where: { createdAt: { gte: chartStart } },
      select: { createdAt: true },
    }),
    prisma.session.findMany({
      orderBy: { lastActiveAt: "desc" },
      take: 20,
      select: {
        joinCode: true,
        createdAt: true,
        lastActiveAt: true,
        _count: { select: { encounters: true, combatants: true, diceRolls: true } },
      },
    }),
  ]);

  // Bucket session creation into Monday-start weeks
  const weeks: { label: string; count: number }[] = [];
  for (let i = 0; i < WEEKS; i++) {
    const ws = new Date(chartStart.getTime() + i * 7 * DAY_MS);
    weeks.push({
      label: ws.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      count: 0,
    });
  }
  for (const s of recentCreated) {
    const idx = Math.floor(
      (startOfWeek(s.createdAt).getTime() - chartStart.getTime()) / (7 * DAY_MS)
    );
    if (idx >= 0 && idx < WEEKS) weeks[idx].count++;
  }
  const maxWeek = Math.max(1, ...weeks.map((w) => w.count));

  const stats = [
    { label: "Total Sessions", value: totalSessions },
    { label: "Encounters", value: totalEncounters },
    { label: "Combatants", value: totalCombatants },
    { label: "Dice Rolls", value: totalRolls },
    { label: "Created (7d)", value: created7d },
    { label: "Created (30d)", value: created30d },
    { label: "Active (7d)", value: active7d },
    { label: "Active (30d)", value: active30d },
  ];

  return (
    <main className="min-h-dvh p-4 sm:p-8 max-w-5xl mx-auto space-y-8">
      <header className="space-y-1">
        <h1 className="text-3xl text-accent-gold">Admin — Usage</h1>
        <p className="text-text-secondary text-sm">
          Last activity: {formatDate(lastActive._max.lastActiveAt)} (
          {relativeTime(lastActive._max.lastActiveAt)})
        </p>
      </header>

      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="card px-4 py-3">
            <div className="text-2xl font-semibold text-text-primary tabular-nums">
              {s.value.toLocaleString("en-US")}
            </div>
            <div className="text-xs text-text-muted uppercase tracking-wider">
              {s.label}
            </div>
          </div>
        ))}
      </section>

      <section className="card p-4 space-y-3">
        <h2 className="text-lg text-text-primary">
          Sessions created per week{" "}
          <span className="text-text-muted text-sm">(last {WEEKS} weeks)</span>
        </h2>
        <div className="flex items-end gap-[2px] h-32">
          {weeks.map((w) => (
            <div
              key={w.label}
              className="group relative flex-1 flex flex-col justify-end h-full"
            >
              <div
                className="rounded-t-[4px] bg-accent-gold group-hover:bg-accent-gold-dim transition-colors"
                style={{
                  height: `${Math.round((w.count / maxWeek) * 100)}%`,
                  minHeight: w.count > 0 ? "4px" : "1px",
                  opacity: w.count > 0 ? 1 : 0.2,
                }}
              />
              <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block whitespace-nowrap rounded bg-bg-tertiary border border-border px-2 py-1 text-xs text-text-primary z-10">
                Week of {w.label}: {w.count}
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-[2px] text-[10px] text-text-muted">
          {weeks.map((w, i) => (
            <div key={w.label} className="flex-1 text-center truncate">
              {i % 2 === 0 ? w.label : ""}
            </div>
          ))}
        </div>
      </section>

      <section className="card p-4 space-y-3">
        <h2 className="text-lg text-text-primary">Recent sessions</h2>
        {recentSessions.length === 0 ? (
          <p className="text-text-muted text-sm">No sessions yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-text-muted text-xs uppercase tracking-wider border-b border-border">
                  <th className="py-2 pr-4">Join Code</th>
                  <th className="py-2 pr-4">Created</th>
                  <th className="py-2 pr-4">Last Active</th>
                  <th className="py-2 pr-4 text-right">Encounters</th>
                  <th className="py-2 pr-4 text-right">Combatants</th>
                  <th className="py-2 text-right">Rolls</th>
                </tr>
              </thead>
              <tbody>
                {recentSessions.map((s) => (
                  <tr
                    key={s.joinCode}
                    className="border-b border-border/50 text-text-secondary"
                  >
                    <td className="py-2 pr-4 font-mono text-text-primary">
                      {s.joinCode}
                    </td>
                    <td className="py-2 pr-4">{formatDate(s.createdAt)}</td>
                    <td className="py-2 pr-4">
                      {formatDate(s.lastActiveAt)}{" "}
                      <span className="text-text-muted">
                        ({relativeTime(s.lastActiveAt)})
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {s._count.encounters}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {s._count.combatants}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {s._count.diceRolls}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
