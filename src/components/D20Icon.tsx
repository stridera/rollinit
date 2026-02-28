export function D20Icon({
  size = 24,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Outer icosahedron shape */}
      <polygon
        points="50,2 95,27 95,73 50,98 5,73 5,27"
        fill="currentColor"
        opacity="0.15"
        stroke="currentColor"
        strokeWidth="2"
      />
      {/* Inner triangular facets */}
      <polygon
        points="50,2 95,27 50,40"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        opacity="0.5"
      />
      <polygon
        points="50,2 5,27 50,40"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        opacity="0.5"
      />
      <polygon
        points="95,27 95,73 50,60"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        opacity="0.5"
      />
      <polygon
        points="5,27 5,73 50,60"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        opacity="0.5"
      />
      <polygon
        points="50,98 95,73 50,60"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        opacity="0.5"
      />
      <polygon
        points="50,98 5,73 50,60"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        opacity="0.5"
      />
      {/* Center diamond */}
      <polygon
        points="50,40 95,27 50,60 5,27"
        fill="currentColor"
        opacity="0.08"
      />
      <polygon
        points="50,40 50,60 95,27"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        opacity="0.5"
      />
      <polygon
        points="50,40 50,60 5,27"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        opacity="0.5"
      />
      {/* "20" text */}
      <text
        x="50"
        y="56"
        textAnchor="middle"
        fill="currentColor"
        fontSize="22"
        fontWeight="bold"
        fontFamily="var(--font-heading), cursive"
      >
        20
      </text>
    </svg>
  );
}
