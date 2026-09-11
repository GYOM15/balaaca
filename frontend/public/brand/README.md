# The brand

| File | What it is | Where |
|---|---|---|
| `favicon.svg` | the mark on a green disc, vector | source of `favicon-512.png` |
| `app-icon.svg` | the mark on a full bleed green square, vector | source of `app-icon-512.png` |
| `favicon-512.png` | generated from `favicon.svg` | browser tab, manifest `any` |
| `app-icon-512.png` | generated from `app-icon.svg` | home screen, manifest `maskable`, Apple touch icon |
| `logo.png` | ivory ground, still a crop | header, footer |
| `logo-inverse.png` | deep green ground, still a crop | dashboard sidebar, a provider's cover band |

## The two that are vector now

`favicon.svg` and `app-icon.svg` hold the same monogram at the same
coordinates, and differ only in their ground: a disc for the tab, an opaque
full bleed square for a launcher. The square is not rounded, deliberately.
Android and iOS crop a maskable icon to their own shape, so corners drawn here
would be cropped out of corners, and the mark is inside the middle 80 % that
survives either crop.

Regenerating the PNGs is one command each:

```bash
rsvg-convert -w 512 -h 512 favicon.svg  -o favicon-512.png
rsvg-convert -w 512 -h 512 app-icon.svg -o app-icon-512.png
```

Change the SVG, run those two lines, commit all four files. Nothing in the code
names anything but these paths.

## The two that are not

`logo.png` and `logo-inverse.png` are still **crops of the brand sheet**, an
image of 1536 x 1024 pixels in which the monogram is drawn at about sixty. They
are enlarged from that source to 256 and masked to their own corners, which is
sharp at the 26 pixels the header draws and soft at anything larger.

They are the next thing to regenerate from `favicon.svg`, and the only reason
they were not is that changing them changes every page at once.

## Why the mark was redrawn, and what that cost

This file used to forbid redrawing the monogram by hand, on the grounds that an
approximation of a mark is the first thing a brand sheet's rules name. That
prohibition assumed an outside authority. There is none: the owner commissioned
this mark from an image he supplied, and he asked for the vector.

So the geometry was measured off `favicon-512.png` pixel by pixel, not traced
by eye: the three white bars at y 144, 250 and 367 with a stroke of 28, the two
bowls reaching x 316 and x 336, the gold parallelogram leaning up to the right
between x 136 and x 170. Overlaid on the original in difference mode, the
monogram's interior is black and only its edges glow, which is the old file's
blur against a sharp one.

What it still cannot do is print, and what it is not is the original artwork. If
the `.ai` or `.pdf` the sheet came from ever turns up, it wins.
