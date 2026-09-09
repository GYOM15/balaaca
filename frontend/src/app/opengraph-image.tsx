import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { ImageResponse } from "next/og";

/**
 * The card a link to this product shows when it is shared.
 *
 * <p>The layout's own comment says a link on WhatsApp is often the first thing
 * anyone sees of this product, and then declared no Open Graph at all: sharing
 * the site gave a bare grey rectangle. In Guinea that link IS the distribution,
 * so this is not decoration.
 *
 * <p>Generated rather than a file in `public/`. A drawn asset is one more thing
 * to re-export when the wordmark or the palette moves, and it would say its
 * words in a different place from the metadata beside it.
 *
 * <p>Ivory rather than the brand's green, and that is the one decision here.
 * Almost every card in a chat thread is dark or photographic; a light one is
 * what gets noticed, which is the whole job of this image. The green stays
 * where it belongs, in the word.
 *
 * <p>The name alone. Six other compositions were rendered and looked at - a
 * storefront arch, a giant letterform, rings for proximity, the name tiled, a
 * gold band, the logo as a watermark - and every one of them added something
 * to read at a size where nothing but the name survives. The logo tile also
 * turned out to be 256 px square, so any watermark built from it is a 3.4x
 * upscale.
 */
async function clash() {
  const [bold, medium] = await Promise.all([
    readFile(fileURLToPath(new URL("./fonts/ClashDisplay-700.ttf", import.meta.url))),
    readFile(fileURLToPath(new URL("./fonts/ClashDisplay-500.ttf", import.meta.url))),
  ]);
  return [
    { name: "Clash", data: bold, weight: 700 as const, style: "normal" as const },
    { name: "Clash", data: medium, weight: 500 as const, style: "normal" as const },
  ];
}

export const alt = "Balaaca, trouver un professionnel";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const fonts = await clash();
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#FBF7EE",
          fontFamily: "Clash",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 150,
            fontWeight: 700,
            letterSpacing: -4,
            color: "#0C302A",
          }}
        >
          <span>Bal</span>
          {/* The deeper gold, not the light one. On ivory the light gold is
              barely a colour; on the dark ground it was the readable half. */}
          <span style={{ color: "#A5844A" }}>aa</span>
          <span>ca</span>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
