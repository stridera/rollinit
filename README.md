# RollInit

A real-time D&D initiative tracker for in-person and online sessions. The DM creates a session, players join with a 6-character code, and everyone stays in sync via WebSockets.

## Features

- **Real-time initiative tracking** — automatic sort by roll, drag-to-reorder, round/turn management
- **No accounts required** — DM gets a secret token URL, players join via a short code
- **Session management** — lock sessions, regenerate join codes, kick players
- **Player self-registration** — players enter their own name and stats (HP, AC, initiative bonus)
- **Reconnection** — players automatically reconnect on refresh via localStorage
- **Spectator mode** — watch combat without registering a character
- **Hidden combatants** — DM can add hidden monsters invisible to players, then reveal mid-combat
- **Encounter builder** — add visible and hidden monsters separately with proper numbering
- **HP tracking** — per-instance HP bars with damage/heal controls, auto-death at 0 HP, auto-revive above 0
- **Dice roller** — standard notation (2d6+3), quick-roll buttons, private DM rolls
- **Online indicators** — green/gray dots show which players are connected
- **Turn notifications** — browser notifications when it's your turn

## Tech Stack

- [Next.js 16](https://nextjs.org/) (App Router) + TypeScript + React 19
- [Socket.io](https://socket.io/) for real-time communication
- [PostgreSQL](https://www.postgresql.org/) + [Prisma v7](https://www.prisma.io/) (driver adapter pattern)
- [Tailwind CSS v4](https://tailwindcss.com/)
- Custom `server.ts` — Next.js + Socket.io on a single HTTP server via `tsx`

## Prerequisites

- Node.js 20+
- PostgreSQL 14+

## Setup

1. **Clone and install**
   ```bash
   git clone https://github.com/your-username/rollinit.git
   cd rollinit
   npm install
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` with your PostgreSQL connection string.

3. **Set up the database**
   ```bash
   npm run db:push
   ```

4. **Start the dev server**
   ```bash
   npm run dev
   ```
   The app runs at `http://localhost:3200`.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server with hot reload |
| `npm run build` | Production build |
| `npm start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run db:push` | Push schema changes to database |
| `npm run db:generate` | Regenerate Prisma client |
| `npm run db:studio` | Open Prisma Studio (DB GUI) |

## How It Works

1. **DM creates a session** at the homepage — gets a secret DM URL and a 6-character join code
2. **Players join** by entering the join code — they register with a name and stats, or spectate
3. **DM builds encounters** — selects monster templates, sets visible/hidden counts, picks which PCs participate
4. **Initiative phase** — players and DM roll initiative (auto-roll or manual entry)
5. **Combat** — turn-by-turn tracking with HP, conditions, KO/revive, and hidden monster reveals

## Architecture

```
server.ts                 → Custom HTTP server (Next.js + Socket.io)
src/
  app/                    → Next.js App Router pages
  components/
    DMDashboard.tsx       → DM view (combatants, encounters, initiative, dice)
    PlayerView.tsx        → Player view (registration, initiative, dice)
    InitiativeList.tsx    → Initiative order with HP tracking
    EncounterManager.tsx  → Encounter creation and selection
    CombatantList.tsx     → Session-level combatant management
    CombatControls.tsx    → Start rolling / start combat / next turn
    DiceRoller.tsx        → Dice rolling with notation parser
  lib/
    socketHandlers.ts     → All Socket.io event handlers (server-side)
    useSocket.ts          → Socket.io React hook (client-side)
    db.ts                 → Prisma client singleton
    dice.ts               → Dice notation parser and roller
    joinCode.ts           → Join code generator
  types/
    socket.ts             → Shared Socket.io event type definitions
prisma/
  schema.prisma           → Database schema
```

## License

MIT — see [LICENSE](LICENSE).
