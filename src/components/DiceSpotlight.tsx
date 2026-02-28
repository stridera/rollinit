"use client";

interface DiceSpotlightProps {
  total: number;
  isNat20: boolean;
  isNat1: boolean;
  dieColor: string;
}

export function DiceSpotlight({ total, isNat20, isNat1, dieColor }: DiceSpotlightProps) {
  const glowColor = isNat20
    ? "rgba(251, 191, 36, 0.25)"
    : isNat1
    ? "rgba(220, 38, 38, 0.25)"
    : `color-mix(in srgb, ${dieColor} 20%, transparent)`;

  const textColor = isNat20
    ? "var(--nat20-gold)"
    : isNat1
    ? "var(--nat1-red)"
    : dieColor;

  const animClass = isNat20
    ? "animate-nat20"
    : isNat1
    ? "animate-nat1"
    : "animate-spotlight";

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl overflow-hidden">
      {/* Backdrop — solid dark base + subtle color glow on top */}
      <div
        className="absolute inset-0 bg-[rgba(15,14,23,0.96)]"
      />
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(circle at center, ${glowColor} 0%, transparent 50%)`,
        }}
      />

      {/* Content */}
      <div className={`relative text-center ${animClass}`}>
        <div
          className={`font-bold font-[family-name:var(--font-heading)] ${
            isNat20 || isNat1 ? "text-7xl" : "text-5xl"
          }`}
          style={{ color: textColor }}
        >
          {total}
        </div>
        {isNat20 && (
          <div className="text-sm font-bold tracking-widest uppercase mt-1" style={{ color: "var(--nat20-gold)" }}>
            Natural 20!
          </div>
        )}
        {isNat1 && (
          <div className="text-sm font-bold tracking-widest uppercase mt-1" style={{ color: "var(--nat1-red)" }}>
            Critical Fail!
          </div>
        )}
      </div>
    </div>
  );
}
