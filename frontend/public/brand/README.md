# The brand

`logo.png` and `logo-inverse.png` are what the site renders. Replacing them is
the whole procedure: no code names them any other way than by this path.

| File | Ground | Where |
|---|---|---|
| `logo.png` | ivory | header, footer |
| `logo-inverse.png` | deep green | dashboard sidebar, a provider's cover band |
| `favicon-512.png` | — | browser tab, a phone's home screen |

## Where these came from, and what they cannot do

They are **crops of the brand sheet**, an image of 1536 x 1024 pixels in which
the monogram is drawn at about sixty. These files are enlarged from that source
to 256 and masked to their own corners.

At 26 pixels in the header and 32 in a favicon that is sharp, and the sheet
itself gives 16 pixels as the minimum size.

**What they cannot do**, which is why this note exists:

- the 1024-pixel application icon the sheet asks for (section 09);
- print - business card, signage, stamp (section 10);
- any scale beyond 256 pixels.

That needs the **vector**: the original `.svg`, `.ai` or `.pdf`. Dropped here
under the same name with a `.svg` extension it replaces the crop, and the line
to change is in `src/components/ui.tsx`.

## What the sheet forbids

Deformation, recolouring, effects and shadows, rotation, poor contrast, added
elements. Which is why the monogram was **not** redrawn by hand from the image:
an approximation of a mark is the first thing that list names.
