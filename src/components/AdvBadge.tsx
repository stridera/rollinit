function AdvDie({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="shrink-0"
    >
      <polygon
        points="50,2 95,27 95,73 50,98 5,73 5,27"
        fill="currentColor"
        opacity="0.2"
        stroke="currentColor"
        strokeWidth="5"
      />
      <text
        x="50"
        y="66"
        textAnchor="middle"
        fill="currentColor"
        fontSize="50"
        fontWeight="bold"
        fontFamily="var(--font-heading), cursive"
      >
        A
      </text>
    </svg>
  );
}

export function AdvBadge({
  active,
  onClick,
  title,
  className = "",
}: {
  active: boolean;
  onClick?: () => void;
  title?: string;
  className?: string;
}) {
  const isInteractive = !!onClick;

  if (!isInteractive && !active) return null;

  const base =
    "inline-flex items-center gap-0.5 text-[10px] font-semibold rounded transition-all duration-200";

  const state = active
    ? "text-accent-gold"
    : "text-text-muted/40";

  const hover = isInteractive
    ? active
      ? "hover:text-accent-gold-dim"
      : "hover:text-text-muted/70"
    : "";

  const cursor = isInteractive ? "cursor-pointer" : "";

  if (isInteractive) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        title={title ?? (active ? "Initiative Advantage" : "Grant initiative advantage")}
        className={`${base} ${state} ${hover} ${cursor} ${className}`}
      >
        <AdvDie />
      </button>
    );
  }

  return (
    <span
      title={title ?? "Initiative Advantage"}
      className={`${base} ${state} ${className}`}
    >
      <AdvDie />
    </span>
  );
}
