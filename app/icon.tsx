import { ImageResponse } from "next/og";
import { readFileSync } from "fs";
import { join } from "path";

// Favicon: fundo preto com cantos arredondados + "m" handwritten (Sacramento),
// igual ao logo "maestro" no topbar do sistema.

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

const sacramento = readFileSync(join(process.cwd(), "app", "Sacramento-Regular.ttf"));

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#070708",
          borderRadius: 16,
          color: "#ffffff",
          fontFamily: "Sacramento",
          fontSize: 72,
          lineHeight: 1,
        }}
      >
        <div style={{ display: "flex", marginTop: -9, marginLeft: 3 }}>m</div>
      </div>
    ),
    {
      ...size,
      fonts: [{ name: "Sacramento", data: sacramento, style: "normal", weight: 400 }],
    },
  );
}
