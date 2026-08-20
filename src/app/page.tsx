import {
  Swords,
  Heart,
  Dices,
  BookOpen,
  Globe,
  Github,
  Crown,
  Share2,
  Play,
} from "lucide-react";
import { HomeHero } from "@/components/HomeHero";

const FEATURES = [
  {
    icon: Swords,
    title: "Real-Time Initiative Tracking",
    body: "Roll initiative with advantage support, drag to reorder, and advance turns and rounds. The turn order syncs live to every player's phone, tablet, or laptop the moment it changes.",
  },
  {
    icon: Heart,
    title: "Full Combat Management",
    body: "Track HP, temporary HP, armor class, and conditions for every combatant. Dying characters stay in the order for death saves, and monsters can be hidden from players until they strike.",
  },
  {
    icon: Dices,
    title: "Built-In Dice Roller",
    body: "Roll d4 through d100 with modifiers, shared with the table or kept private as the DM. Prefer real dice at the table? Physical dice mode lets you type in the results instead.",
  },
  {
    icon: BookOpen,
    title: "Prep Encounters in Advance",
    body: "Build multiple encounters before game night — the ambush, the boss fight, the escape — and switch between them mid-session without re-entering a single monster.",
  },
  {
    icon: Globe,
    title: "No Accounts, No Installs",
    body: "Nothing to download and no sign-up for you or your players. Create a session, share a six-character join code, and everyone is in from any web browser.",
  },
  {
    icon: Github,
    title: "Free and Open Source",
    body: "RollInit is completely free with no ads, no premium tier, and no locked features. The source code is on GitHub — bug reports and contributions are welcome.",
  },
];

const STEPS = [
  {
    icon: Crown,
    title: "Create a session",
    body: "One click as the Dungeon Master — no account needed. Bookmark your private DM link to return to the same session later.",
  },
  {
    icon: Share2,
    title: "Share the join code",
    body: "Players enter the six-character code on any device and see the live player view. Add an optional password to keep strangers out.",
  },
  {
    icon: Play,
    title: "Run the combat",
    body: "Roll initiative, track HP and conditions, and advance turns. Everyone sees the current turn and dice rolls update in real time.",
  },
];

const FAQ = [
  {
    q: "Is RollInit really free?",
    a: "Yes. RollInit is a completely free, open-source initiative tracker and dice roller. There are no ads, no paid tiers, and no features behind a sign-up wall.",
  },
  {
    q: "Do my players need to create accounts or install anything?",
    a: "No. RollInit runs entirely in the browser. Players join with a six-character code, and the DM gets a private link — no accounts, downloads, or installs for anyone.",
  },
  {
    q: "What game systems does RollInit work with?",
    a: "RollInit is built with D&D 5e in mind, but it works for any game with rolled initiative and hit points — Pathfinder, older D&D editions, and most d20-style RPGs.",
  },
  {
    q: "Can players see monster HP and hidden enemies?",
    a: "Only if you want them to. The DM can hide monsters from the player view entirely and choose whether players see monster health bars.",
  },
  {
    q: "We roll physical dice at the table — can we still use it?",
    a: "Yes. Turn on physical dice mode and enter the rolls you make at the table, while RollInit handles the turn order, HP, and conditions on screen.",
  },
  {
    q: "How do I get back to my game later?",
    a: "Bookmark the private DM link created with your session. Sessions persist, so you can prep encounters during the week and pick up where you left off on game night.",
  },
];

const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebApplication",
      name: "RollInit",
      url: "https://rollinit.app",
      description:
        "Free online D&D initiative tracker and dice roller. Track combat turn order, HP, and conditions in real time with your players — no accounts or installs required.",
      applicationCategory: "GameApplication",
      operatingSystem: "Web",
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    },
    {
      "@type": "FAQPage",
      mainEntity: FAQ.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: { "@type": "Answer", text: item.a },
      })),
    },
  ],
};

export default function Home() {
  return (
    <>
      <HomeHero />

      <div className="relative z-10 max-w-4xl mx-auto px-4 pb-16 space-y-16">
        {/* Intro */}
        <section className="text-center space-y-3 max-w-2xl mx-auto">
          <h2 className="text-3xl">A Free Online Initiative Tracker for D&D</h2>
          <p className="text-text-secondary">
            RollInit is a free combat tracker and dice roller for Dungeons &
            Dragons 5e and other tabletop RPGs. Run initiative order, hit
            points, and conditions from one screen while your players follow
            along live on their own devices — at the table or over a video
            call.
          </p>
        </section>

        {/* Features */}
        <section className="space-y-6">
          <h2 className="text-2xl text-center">Everything You Need to Run Combat</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map((f) => (
              <div key={f.title} className="card space-y-2">
                <f.icon size={22} className="text-accent-gold" aria-hidden />
                <h3 className="text-lg" style={{ fontFamily: "var(--font-body)" }}>{f.title}</h3>
                <p className="text-text-secondary text-sm">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="space-y-6">
          <h2 className="text-2xl text-center">How It Works</h2>
          <div className="grid sm:grid-cols-3 gap-4">
            {STEPS.map((s, i) => (
              <div key={s.title} className="card space-y-2 text-center">
                <div className="flex items-center justify-center gap-2 text-accent-gold">
                  <span className="text-sm font-semibold">{i + 1}.</span>
                  <s.icon size={20} aria-hidden />
                </div>
                <h3 className="text-lg" style={{ fontFamily: "var(--font-body)" }}>{s.title}</h3>
                <p className="text-text-secondary text-sm">{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section className="space-y-6 max-w-2xl mx-auto">
          <h2 className="text-2xl text-center">Frequently Asked Questions</h2>
          <div className="space-y-4">
            {FAQ.map((item) => (
              <div key={item.q} className="card space-y-1">
                <h3 className="text-base font-semibold text-text-primary" style={{ fontFamily: "var(--font-body)" }}>
                  {item.q}
                </h3>
                <p className="text-text-secondary text-sm">{item.a}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
      />
    </>
  );
}
