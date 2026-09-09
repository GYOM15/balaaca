import { ImageResponse } from "next/og";

/**
 * The card a link to this product shows when it is shared.
 *
 * <p>The layout's own comment says a link on WhatsApp is often the first thing
 * anyone sees of this product, and then declared no Open Graph at all: sharing
 * the site gave a bare grey rectangle. In Guinea that link IS the distribution,
 * so the card is not decoration.
 *
 * <p>Generated rather than a file in `public/`. A drawn asset is one more thing
 * to re-export when the wordmark or the palette moves, and it would say the
 * same words in a different place from the metadata that accompanies it.
 *
 * <p>No custom font, and that is a limitation rather than a choice: Satori,
 * which renders this, does not read woff2, and all four faces of the display
 * font are woff2. Converting them would add a build step and a second copy of
 * a brand asset. At the size a card is actually seen - a thumbnail in a chat -
 * colour and layout carry the brand and the letterforms do not.
 */
export const alt = "Balaaca, trouver un professionnel";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
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
          // The brand's own green, deepest at the top left where the eye lands
          // in a chat thumbnail.
          backgroundImage: "linear-gradient(135deg, #081F1B 0%, #123C35 52%, #1B5148 100%)",
        }}
      >
        {/* A gold wash, low and to the right, so the ground is not flat
            without competing with the word. A RADIAL GRADIENT and not a circle
            with an opacity: the first version was a solid disc at 0.16, and a
            disc has an EDGE. Rendered, it read as a mistake rather than as
            light. */}
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

        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <div
            style={{
              display: "flex",
              fontSize: 118,
              fontWeight: 800,
              letterSpacing: -3,
              color: "#FBF7EE",
            }}
          >
            {/* The two golden a's are the wordmark, and they survive whatever
                font Satori falls back to. */}
            <span>B</span>
            <span>al</span>
            <span style={{ color: "#C9A86A" }}>aa</span>
            <span>ca</span>
          </div>
          <div style={{ display: "flex", fontSize: 40, color: "#A9C4BD", maxWidth: 900 }}>
            Trouvez un professionnel près de chez vous et réservez votre créneau
            en ligne.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ display: "flex", width: 44, height: 4, background: "#C9A86A" }} />
          {/* What somebody can DO, not which trades exist. The first version
              named six of the thirty-four V025 seeds, all from beauty and
              events, which described a narrower hub than the real one -
              électricité, plomberie and mécanique-auto were already in there. A
              list on a card is a list that is wrong the day a trade is added. */}
          <div style={{ display: "flex", fontSize: 30, color: "#DCE7E4" }}>
            Réservez en ligne, sans créer de compte
          </div>
        </div>
      </div>
    ),
    size,
  );
}
