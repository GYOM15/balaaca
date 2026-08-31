/**
 * The eight hand-drawn sketches, ported from the reference mockup.
 *
 * <p>They existed there and were used almost nowhere: the gallery on the design
 * system page showed all eight, and the only two the product ever rendered were
 * the storefront on the professionals page and `braiding` - hardcoded as the
 * cover of EVERY provider page, so a caterer, a photographer and a tailor all
 * carried a hairdresser's mirror.
 *
 * <p>`mechanic` is in here too, drawn and never used, because the taxonomy had
 * no mechanic to give it to.
 */

export type Sketch = { viewBox: string; body: string };

export const SKETCHES: Record<string, Sketch> = {
  "braiding": {
    viewBox: "0 0 240 200",
    body:
      "<path d=\"M14 164h212\"/><path d=\"M22 164v11h196v-11\"/><path d=\"M92 164V96a38 38 0 0 1 76 0v68\"/><path d=\"M100 164V96a30 30 0 0 1 60 0v68\"/><circle cx=\"82\" cy=\"96\" r=\"4.6\"/><circle cx=\"88\" cy=\"72\" r=\"4.6\"/><circle cx=\"106\" cy=\"55\" r=\"4.6\"/><circle cx=\"130\" cy=\"48\" r=\"4.6\"/><circle cx=\"154\" cy=\"55\" r=\"4.6\"/><circle cx=\"172\" cy=\"72\" r=\"4.6\"/><circle cx=\"178\" cy=\"96\" r=\"4.6\"/><path d=\"M24 158h44v6H24z\"/><path d=\"M29 158v-10M35 158v-10M41 158v-10M47 158v-10M53 158v-10M59 158v-10M65 158v-10\"/><path d=\"M188 164v-30a5 5 0 0 1 5-5h14a5 5 0 0 1 5 5v30\"/><path d=\"M195 129v-9h10v9M196 120v-7h8v7M204 116h9l-4-7\"/>",
  },
  "chair": {
    viewBox: "0 0 200 200",
    body:
      "<path d=\"M64 34h56a11 11 0 0 1 11 11v50a11 11 0 0 1-11 11H64a11 11 0 0 1-11-11V45a11 11 0 0 1 11-11Z\"/><path d=\"M75 34c0-9 7-16 16-16h2c9 0 16 7 16 16\"/><path d=\"M79 25h30\"/><path d=\"M44 106h96a9 9 0 0 1 9 9v11a9 9 0 0 1-9 9H44a9 9 0 0 1-9-9v-11a9 9 0 0 1 9-9Z\"/><path d=\"M35 112H26a7 7 0 0 0-7 7v16M149 112h9a7 7 0 0 1 7 7v16\"/><path d=\"M92 135v25M70 154h44\"/><path d=\"M92 160 46 180M92 160l46 20M92 160v22\"/><circle cx=\"42\" cy=\"182\" r=\"5\"/><circle cx=\"142\" cy=\"182\" r=\"5\"/><circle cx=\"92\" cy=\"184\" r=\"5\"/>",
  },
  "mechanic": {
    viewBox: "0 0 240 200",
    body:
      "<path d=\"M12 176h216\"/><path d=\"M24 152c-2-16 2-27 12-31l26-6c10-16 24-24 42-24h30c18 0 32 8 42 24l24 6c12 4 16 15 14 31\"/><path d=\"M24 152h19a25 25 0 0 1 50 0h54a25 25 0 0 1 50 0h17\"/><path d=\"M74 112c8-14 18-21 32-21h26c14 0 24 7 32 21Z\"/><path d=\"M114 91v21\"/><path d=\"M114 120v22M122 130h14M28 130h13\"/><circle cx=\"68\" cy=\"152\" r=\"22\"/><circle cx=\"68\" cy=\"152\" r=\"9\"/><circle cx=\"172\" cy=\"152\" r=\"22\"/><circle cx=\"172\" cy=\"152\" r=\"9\"/><path d=\"M106 174v-16a3 3 0 0 1 3-3h30a3 3 0 0 1 3 3v16Z\"/><path d=\"M118 155v-5a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v5M106 164h36\"/>",
  },
  "notebook": {
    viewBox: "0 0 200 180",
    body:
      "<path d=\"M36 34h104a7 7 0 0 1 7 7v98a7 7 0 0 1-7 7H36a7 7 0 0 1-7-7V41a7 7 0 0 1 7-7Z\"/><path d=\"M50 34v112\"/><path d=\"M40 52h4M40 68h4M40 84h4M40 100h4M40 116h4\"/><path d=\"M68 66h58M68 84h58M68 102h36\"/><path d=\"m158 46 16 16-62 62-21 5 5-21Z\"/><path d=\"m151 53 16 16\"/><path d=\"m91 124 21 5\"/>",
  },
  "photographer": {
    viewBox: "0 0 240 200",
    body:
      "<path d=\"M62 78h84a10 10 0 0 1 10 10v38a10 10 0 0 1-10 10H62a10 10 0 0 1-10-10V88a10 10 0 0 1 10-10Z\"/><path d=\"M88 78l6-13h26l6 13\"/><circle cx=\"104\" cy=\"107\" r=\"24\"/><circle cx=\"104\" cy=\"107\" r=\"15\"/><circle cx=\"104\" cy=\"107\" r=\"5\"/><circle cx=\"140\" cy=\"92\" r=\"6\"/><path d=\"M140 78v-5\"/><path d=\"M104 136v12M104 148l-26 44M104 148l26 44M104 152v36M88 172h32\"/><path d=\"M182 66h34a4 4 0 0 1 4 4v72a4 4 0 0 1-4 4h-34a4 4 0 0 1-4-4V70a4 4 0 0 1 4-4Z\"/><path d=\"M199 146v38M186 190l13-6 13 6\"/><path d=\"M188 46h22M199 46v20\"/>",
  },
  "storefront": {
    viewBox: "0 0 240 190",
    body:
      "<path d=\"M12 166h216\"/><path d=\"M42 166V66h136v100\"/><path d=\"M32 66h156l-8-20H40Z\"/><path d=\"M32 66q7 9 14 0 7 9 14 0 7 9 14 0 7 9 14 0 7 9 14 0 7 9 14 0 7 9 14 0 7 9 14 0 7 9 14 0 7 9 14 0 7 9 14 0\"/><path d=\"M66 46l-4 20M94 46l-4 20M122 46l-4 20M150 46l-4 20\"/><path d=\"M56 90h52v48H56z\"/><path d=\"M56 108h52\"/><path d=\"M126 166V94h38v72\"/><circle cx=\"133\" cy=\"130\" r=\"2.6\"/><path d=\"M198 44v24M186 68h30v20h-30z\"/><path d=\"M198 166v-24M198 150c-9-2-13-9-13-16 9 0 13 7 13 16ZM198 146c9-3 12-10 12-17-9 0-12 8-12 17Z\"/><path d=\"M186 166h24l-3-16h-18Z\"/>",
  },
  "tailor": {
    viewBox: "0 0 240 200",
    body:
      "<path d=\"M14 162h212\"/><path d=\"M58 162v-24a5 5 0 0 1 5-5h98a5 5 0 0 1 5 5v24\"/><path d=\"M154 133V92c0-11-6-18-17-18H89c-11 0-17 7-17 18v18\"/><path d=\"M63 110h18v18H63z\"/><path d=\"M72 128v13M65 142h13\"/><circle cx=\"164\" cy=\"99\" r=\"11\"/><circle cx=\"164\" cy=\"99\" r=\"3.4\"/><path d=\"M97 40h18M97 60h18M101 40v20M111 40v20\"/><path d=\"M106 60c0 11-16 13-24 21s-10 21-10 29\"/><path d=\"M170 152c20-9 36 3 56-8M172 161c22-7 40 5 54-6M188 155c5 4 10 6 15 6\"/>",
  },
  "tools": {
    viewBox: "0 0 200 180",
    body:
      "<path d=\"M12 146h176\"/><path d=\"M20 139h52v7H20z\"/><path d=\"M26 139v-11M33 139v-11M40 139v-11M47 139v-11M54 139v-11M61 139v-11M68 139v-11\"/><g transform=\"rotate(14 104 116)\"><circle cx=\"97\" cy=\"136\" r=\"7\"/><circle cx=\"113\" cy=\"136\" r=\"7\"/><path d=\"M101 129l14-44M109 129L95 85\"/><path d=\"M103 118h4\"/></g><path d=\"M140 146v-42a5 5 0 0 1 5-5h34a5 5 0 0 1 5 5v42\"/><path d=\"M140 110c10 5 20 5 30 0M140 124c12 5 24 5 34 0\"/>",
  },
};
