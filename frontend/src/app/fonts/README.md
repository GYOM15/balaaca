# Clash Display

Four woff2 faces, loaded by `next/font/local` in `app/layout.tsx` and exposed as
`--font-display-face`. Replacing the family is dropping four files here; nothing
in the code names a weight it does not load.

## The two TTFs beside them

`ClashDisplay-500.ttf` and `ClashDisplay-700.ttf` exist for the Open Graph
cards, and only for them. **Satori, which renders `ImageResponse`, cannot read
woff2**, so a card asking for the display face got whatever face Satori falls
back to - which is not this product's wordmark.

They are converted from the woff2 in this folder, losslessly: same outlines, a
container Satori can parse. To regenerate after replacing the family:

```bash
python3 -m pip install --user fonttools brotli
cd frontend/src/app/fonts
for w in 500 700; do
  python3 -c "
from fontTools.ttLib import TTFont
f = TTFont('ClashDisplay-$w.woff2'); f.flavor = None; f.save('ClashDisplay-$w.ttf')"
done
```

Only the weights the cards use. Adding a third means a third file committed for
no reader.

**The source woff2 carries a broken name table**: its family name reads
`false`, which is why the cards pass `name: "Clash"` to `ImageResponse` rather
than relying on the name inside the file. If a replacement family has a correct
table, that argument goes away but the explicit name does no harm.
