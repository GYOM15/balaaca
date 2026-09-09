import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { ImageResponse } from "next/og";
import { publicApi } from "@/lib/api";
import type { CategoryList, PublicProvider } from "@/lib/types";

/**
 * The card a provider's link shows when it is shared, when there is no
 * photograph to show instead.
 *
 * <p>`generateMetadata` prefers the cover, then the logo: a real picture of the
 * business beats anything generated. This is what happens when there is
 * neither, which is every salon that registered this morning - and those are
 * exactly the ones pasting their link into WhatsApp all day. Until now they got
 * a grey rectangle.
 *
 * <p>Next attaches this file automatically to the segment, and the metadata's
 * explicit `images` overrides it when a cover exists. So the precedence does
 * the choosing and no condition here has to.
 *
 * <p>A failure draws the card without the trade rather than throwing. An image
 * route that 500s gives the grey rectangle back, which is the thing this file
 * exists to remove.
 */
/**
 * The display face, as the site draws it.
 *
 * <p>Satori cannot read woff2, and all four faces in `app/fonts` are woff2, so
 * these two are TTFs converted from them - `docs` in that folder's README has
 * the command. The conversion is lossless: same outlines, a container Satori
 * can parse.
 *
 * <p>`readFile` on a path from `import.meta.url`, not `fetch`. Fetching a
 * `file:` URL is the documented pattern for the edge runtime and Node's undici
 * answers "not implemented... yet", which fails the BUILD - the root card is
 * prerendered. And not `process.cwd()` either: the build traces a URL relative
 * to this module and copies the font into the standalone output, while a string
 * assembled at run time is one it cannot follow.
 *
 * <p>The family is named here because the source woff2 carries a broken name
 * table - its family reads "false" - and Satori matches on the name it is
 * given, not on the one inside the file.
 */
async function clash() {
  const [bold, medium] = await Promise.all([
    readFile(fileURLToPath(new URL("../../fonts/ClashDisplay-700.ttf", import.meta.url))),
    readFile(fileURLToPath(new URL("../../fonts/ClashDisplay-500.ttf", import.meta.url))),
  ]);
  return [
    { name: "Clash", data: bold, weight: 700 as const, style: "normal" as const },
    { name: "Clash", data: medium, weight: 500 as const, style: "normal" as const },
  ];
}

export const alt = "La page de ce professionnel sur Balaaca";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const fonts = await clash();

  let name = "Sur Balaaca";
  let line = "";
  try {
    const at = `/v1/providers/${encodeURIComponent(slug)}`;
    const [provider, categories] = await Promise.all([
      publicApi<PublicProvider>(at),
      publicApi<CategoryList>("/v1/categories"),
    ]);
    name = provider.business_name;
    const trade = categories.data.find((c) => c.slug === provider.category_slug)?.label_fr;
    // The trade and the place, in the order somebody would say them.
    line = [trade, provider.locality?.label_fr ?? provider.city]
      .filter(Boolean)
      .join(" · ");
  } catch {
    // Deliberately silent: see above.
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: "#FBF7EE",
          fontFamily: "Clash",
        }}
      >

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {line ? (
            <div
              style={{
                display: "flex",
                fontSize: 30,
                letterSpacing: 4,
                textTransform: "uppercase",
                color: "#A5844A",
              }}
            >
              {line}
            </div>
          ) : null}
          {/* The name is the picture here. It is sized down for a long one
              rather than wrapped to three lines, which at thumbnail size turns
              into a grey block. */}
          <div
            style={{
              display: "flex",
              fontSize: name.length > 26 ? 76 : 104,
              fontWeight: 800,
              letterSpacing: -2,
              color: "#0C302A",
              lineHeight: 1.05,
            }}
          >
            {name}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ display: "flex", width: 44, height: 4, background: "#A5844A" }} />
          <div style={{ display: "flex", fontSize: 30, color: "#4A5A55" }}>
            Réservez en ligne, sans créer de compte
          </div>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
