import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0b7d4c" }}>
        <svg width="120" height="120" viewBox="0 0 32 32">
          <path d="M7 21.5 13 9l12 4.5-3.5 10.5L7 21.5Z" fill="none" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
          <circle cx="16.5" cy="16" r="2.6" fill="#fff" />
        </svg>
      </div>
    ),
    size,
  );
}
