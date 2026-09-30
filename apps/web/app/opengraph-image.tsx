import { ImageResponse } from "next/og";

export const alt = "Haalo: A daily call for the people who raised you.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Per-page OG image: the orb on morning indigo. Fonts fall back to the system sans (no network font fetch at build). */
export default function OG() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", background: "#1B2246", padding: 80, position: "relative" }}>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 24 }}>
          <div style={{ display: "flex", fontSize: 32, color: "#F3A712", fontWeight: 700 }}>Haalo</div>
          <div style={{ display: "flex", fontSize: 76, lineHeight: 1.05, color: "#EEF2F8", fontWeight: 700, maxWidth: 640 }}>
            A daily call for the people who raised you.
          </div>
          <div style={{ display: "flex", fontSize: 30, color: "#AEB6D0" }}>Marathi · हिन्दी · English</div>
        </div>
        <div style={{ display: "flex", width: 380, height: 380, alignItems: "center", justifyContent: "center", position: "relative" }}>
          <div style={{ position: "absolute", width: 380, height: 380, borderRadius: 999, border: "2px solid rgba(243,167,18,.3)" }} />
          <div style={{ position: "absolute", width: 300, height: 300, borderRadius: 999, border: "2px solid rgba(243,167,18,.45)" }} />
          <div style={{ width: 210, height: 210, borderRadius: 999, background: "radial-gradient(circle at 35% 30%, #FFE29A, #F3A712 60%, #D98A00)" }} />
        </div>
      </div>
    ),
    size,
  );
}
