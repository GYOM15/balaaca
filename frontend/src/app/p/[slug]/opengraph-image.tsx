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
export const alt = "La page de ce professionnel sur Balaaca";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

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
          backgroundImage: "linear-gradient(135deg, #081F1B 0%, #123C35 52%, #1B5148 100%)",
        }}
      >
        <div
          style={{
            position: "absolute",
            right: -260,
            bottom: -300,
            width: 900,
            height: 900,
            backgroundImage:
              "radial-gradient(circle at center, rgba(201,168,106,0.30) 0%, rgba(201,168,106,0.12) 42%, rgba(201,168,106,0) 70%)",
          }}
        />

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {line ? (
            <div
              style={{
                display: "flex",
                fontSize: 30,
                letterSpacing: 4,
                textTransform: "uppercase",
                color: "#C9A86A",
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
              color: "#FBF7EE",
              lineHeight: 1.05,
            }}
          >
            {name}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ display: "flex", width: 44, height: 4, background: "#C9A86A" }} />
          <div style={{ display: "flex", fontSize: 30, color: "#DCE7E4" }}>
            Réservez en ligne, sans créer de compte
          </div>
        </div>
      </div>
    ),
    size,
  );
}
