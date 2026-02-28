import { ImageResponse } from "next/og";

export const runtime = "edge";

export const alt = "RollInit - D&D Initiative Tracker & Dice Roller";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const d20Svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 100 100" fill="none">
  <polygon points="50,2 95,27 95,73 50,98 5,73 5,27" fill="#d4a843" opacity="0.15" stroke="#d4a843" stroke-width="2"/>
  <polygon points="50,2 95,27 50,40" fill="none" stroke="#d4a843" stroke-width="1.5" opacity="0.6"/>
  <polygon points="50,2 5,27 50,40" fill="none" stroke="#d4a843" stroke-width="1.5" opacity="0.6"/>
  <polygon points="95,27 95,73 50,60" fill="none" stroke="#d4a843" stroke-width="1.5" opacity="0.6"/>
  <polygon points="5,27 5,73 50,60" fill="none" stroke="#d4a843" stroke-width="1.5" opacity="0.6"/>
  <polygon points="50,98 95,73 50,60" fill="none" stroke="#d4a843" stroke-width="1.5" opacity="0.6"/>
  <polygon points="50,98 5,73 50,60" fill="none" stroke="#d4a843" stroke-width="1.5" opacity="0.6"/>
  <polygon points="50,40 95,27 50,60 5,27" fill="#d4a843" opacity="0.08"/>
  <polygon points="50,40 50,60 95,27" fill="none" stroke="#d4a843" stroke-width="1.5" opacity="0.6"/>
  <polygon points="50,40 50,60 5,27" fill="none" stroke="#d4a843" stroke-width="1.5" opacity="0.6"/>
  <text x="50" y="56" text-anchor="middle" fill="#d4a843" font-size="22" font-weight="bold">20</text>
</svg>`;

const d20DataUri = `data:image/svg+xml,${encodeURIComponent(d20Svg)}`;

export default async function OpenGraphImage() {
  const medievalSharp = await fetch(
    "https://fonts.gstatic.com/s/medievalsharp/v28/EvOJzAlL3oU5AQl2mP5KdgptAq8.ttf"
  ).then((res) => res.arrayBuffer());

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0f0e17",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Top gold gradient accent */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "4px",
            background: "linear-gradient(90deg, transparent, #d4a843, transparent)",
            display: "flex",
          }}
        />

        {/* Bottom gold gradient accent */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: "4px",
            background: "linear-gradient(90deg, transparent, #d4a843, transparent)",
            display: "flex",
          }}
        />

        {/* Subtle radial glow behind the die */}
        <div
          style={{
            position: "absolute",
            width: "400px",
            height: "400px",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(212,168,67,0.08) 0%, transparent 70%)",
            display: "flex",
          }}
        />

        {/* D20 die */}
        <img
          src={d20DataUri}
          width={160}
          height={160}
          style={{ marginBottom: "24px" }}
        />

        {/* Title */}
        <div
          style={{
            fontFamily: "MedievalSharp",
            fontSize: "80px",
            color: "#d4a843",
            lineHeight: 1,
            marginBottom: "16px",
            display: "flex",
          }}
        >
          RollInit
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontSize: "28px",
            color: "rgba(255,255,255,0.7)",
            letterSpacing: "0.05em",
            display: "flex",
          }}
        >
          D&D Initiative Tracker & Dice Roller
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        {
          name: "MedievalSharp",
          data: medievalSharp,
          style: "normal",
        },
      ],
    }
  );
}
