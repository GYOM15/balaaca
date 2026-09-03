/**
 * The icon set, ported verbatim from the reference mockup.
 *
 * <p>Two maps, and the split is the point. UI icons are named after what they
 * DEPICT; trade icons are keyed by the slug `GET /v1/categories` publishes -
 * `spa-massage`, not `spa`. The mockup keyed them by its own hardcoded list,
 * and six of those eighteen keys did not match the ones the server sends, so
 * six trades would have silently lost their icon the day the grid was wired to
 * the API. Keying on the published slug is what makes that impossible rather
 * than merely fixed.
 *
 * <p>The paths are data. Nothing here is generated at runtime and nothing
 * fetches: they are inline SVG on a 24 grid, stroked with currentColor, so an
 * icon takes the colour of the text it sits in.
 */

export const UI_ICONS: Record<string, string> = {
  "activity":
    "<path d=\"M4 19.4V4.6M4 19.4h16\"/><path d=\"m7.6 15.2 3.6-4.4 3 2.6 5.2-5.6\"/>",
  "alert-circle":
    "<circle cx=\"12\" cy=\"12\" r=\"8.6\"/><path d=\"M12 7.4v5.2\"/><circle cx=\"12\" cy=\"16.2\" r=\"1.1\" fill=\"currentColor\" stroke=\"none\"/>",
  "alert-triangle":
    "<path d=\"M12 3.8 2.9 20.2h18.2Z\"/><path d=\"M12 9.8v4\"/><circle cx=\"12\" cy=\"17.1\" r=\"1.1\" fill=\"currentColor\" stroke=\"none\"/>",
  "arrow-left":
    "<path d=\"M20.4 12H3.6M10 5.6 3.6 12 10 18.4\"/>",
  "arrow-right":
    "<path d=\"M3.6 12h16.8M14 5.6l6.4 6.4-6.4 6.4\"/>",
  "arrow-up-right":
    "<path d=\"M7 17 17.4 6.6M8.6 6.6h8.8v8.8\"/>",
  "ban":
    "<circle cx=\"12\" cy=\"12\" r=\"8.6\"/><path d=\"M5.9 18.1 18.1 5.9\"/>",
  "bell":
    "<path d=\"M18 9.4a6 6 0 1 0-12 0c0 5.2-2 6.6-2 6.6h16s-2-1.4-2-6.6Z\"/><path d=\"M10.3 19.4a2 2 0 0 0 3.4 0\"/>",
  "briefcase":
    "<rect x=\"3\" y=\"7\" width=\"18\" height=\"13\" rx=\"2.4\"/><path d=\"M8.4 7V5.6A1.6 1.6 0 0 1 10 4h4a1.6 1.6 0 0 1 1.6 1.6V7M3 12.6h18\"/>",
  "calendar":
    "<rect x=\"3\" y=\"5\" width=\"18\" height=\"16\" rx=\"2.5\"/><path d=\"M8 3v4M16 3v4M3 10.5h18\"/>",
  "calendar-check":
    "<rect x=\"3\" y=\"5\" width=\"18\" height=\"16\" rx=\"2.5\"/><path d=\"M8 3v4M16 3v4M3 10.5h18M8.8 15.4l2.4 2.4 4.2-4.4\"/>",
  "calendar-plus":
    "<rect x=\"3\" y=\"5\" width=\"18\" height=\"16\" rx=\"2.5\"/><path d=\"M8 3v4M16 3v4M3 10.5h18M12 13.5v5M9.5 16h5\"/>",
  "check":
    "<path d=\"m4.5 12.6 4.9 4.9L19.5 6.9\"/>",
  "check-circle":
    "<circle cx=\"12\" cy=\"12\" r=\"8.6\"/><path d=\"m8.2 12.3 2.6 2.6 5-5.2\"/>",
  "check-double":
    "<path d=\"m2.5 12.6 3.8 3.8 8.6-8.8M11 16.4l2 2 8.5-8.8\"/>",
  "chevron-down":
    "<path d=\"m5 9 7 7 7-7\"/>",
  "chevron-left":
    "<path d=\"M15 5 8 12l7 7\"/>",
  "chevron-right":
    "<path d=\"m9 5 7 7-7 7\"/>",
  "chevron-up":
    "<path d=\"m5 15 7-7 7 7\"/>",
  "clock":
    "<circle cx=\"12\" cy=\"12\" r=\"8.6\"/><path d=\"M12 6.8V12l3.4 2\"/>",
  "copy":
    "<rect x=\"8\" y=\"8\" width=\"12\" height=\"12\" rx=\"2.4\"/><path d=\"M16 8V6.2A2.2 2.2 0 0 0 13.8 4H6.2A2.2 2.2 0 0 0 4 6.2v7.6A2.2 2.2 0 0 0 6.2 16H8\"/>",
  "dot-circle":
    "<circle cx=\"12\" cy=\"12\" r=\"8.6\"/><circle cx=\"12\" cy=\"12\" r=\"3\" fill=\"currentColor\" stroke=\"none\"/>",
  "download":
    "<path d=\"M12 3.6v11.2M7.6 10.4 12 14.8l4.4-4.4M4 17.4v1.4A1.8 1.8 0 0 0 5.8 20.6h12.4A1.8 1.8 0 0 0 20 18.8v-1.4\"/>",
  "edit":
    "<path d=\"M4 20h4L18.4 9.6a2.1 2.1 0 0 0-3-3L5 17Z\"/><path d=\"m14 6.6 3.4 3.4\"/>",
  "external":
    "<path d=\"M14 4h6v6M20 4l-9 9\"/><path d=\"M18 14.2V19a1.6 1.6 0 0 1-1.6 1.6H5A1.6 1.6 0 0 1 3.4 19V7.6A1.6 1.6 0 0 1 5 6h4.8\"/>",
  "eye":
    "<path d=\"M2.4 12S6 6.2 12 6.2 21.6 12 21.6 12 18 17.8 12 17.8 2.4 12 2.4 12Z\"/><circle cx=\"12\" cy=\"12\" r=\"2.9\"/>",
  "eye-off":
    "<path d=\"M4 4.4 20 20.4M9.6 9.7a2.9 2.9 0 0 0 4 4.1M6.3 7.2A11.9 11.9 0 0 0 2.4 12S6 17.8 12 17.8a10 10 0 0 0 4-.8M18.4 15.4A11.7 11.7 0 0 0 21.6 12S18 6.2 12 6.2a9.6 9.6 0 0 0-2 .2\"/>",
  "filter":
    "<path d=\"M3.2 5.8h17.6M6.6 12h10.8M10 18.2h4\"/>",
  "globe":
    "<circle cx=\"12\" cy=\"12\" r=\"8.6\"/><path d=\"M3.4 12h17.2M12 3.4c2.4 2.6 3.7 5.5 3.7 8.6S14.4 18 12 20.6C9.6 18 8.3 15.1 8.3 12S9.6 6 12 3.4Z\"/>",
  "help":
    "<circle cx=\"12\" cy=\"12\" r=\"8.6\"/><path d=\"M9.4 9.4a2.7 2.7 0 0 1 5.2.9c0 1.9-2.6 2.3-2.6 3.9\"/><circle cx=\"12\" cy=\"17\" r=\"1.1\" fill=\"currentColor\" stroke=\"none\"/>",
  "home":
    "<path d=\"M3.6 10.6 12 3.8l8.4 6.8v8.6a1.4 1.4 0 0 1-1.4 1.4H5a1.4 1.4 0 0 1-1.4-1.4Z\"/><path d=\"M9.4 20.6V14.4h5.2v6.2\"/>",
  "hourglass":
    "<path d=\"M7 3h10M7 21h10M8 3v3.2c0 2 4 3.6 4 5.8s-4 3.8-4 5.8V21M16 3v3.2c0 2-4 3.6-4 5.8s4 3.8 4 5.8V21\"/>",
  "image":
    "<rect x=\"3\" y=\"4.4\" width=\"18\" height=\"15.2\" rx=\"2.4\"/><circle cx=\"8.6\" cy=\"9.6\" r=\"1.7\"/><path d=\"m3.4 17.2 5.2-5.2 4.4 4.4 3-3 4.6 4.6\"/>",
  "info":
    "<circle cx=\"12\" cy=\"12\" r=\"8.6\"/><path d=\"M12 11.2v5.4\"/><circle cx=\"12\" cy=\"7.8\" r=\"1.1\" fill=\"currentColor\" stroke=\"none\"/>",
  "layout":
    "<rect x=\"3\" y=\"4\" width=\"18\" height=\"16\" rx=\"2.5\"/><path d=\"M3 10h18M10.2 10v10\"/>",
  "list":
    "<path d=\"M8.4 6.6h11.8M8.4 12h11.8M8.4 17.4h8\"/><circle cx=\"4.4\" cy=\"6.6\" r=\"1.3\" fill=\"currentColor\" stroke=\"none\"/><circle cx=\"4.4\" cy=\"12\" r=\"1.3\" fill=\"currentColor\" stroke=\"none\"/><circle cx=\"4.4\" cy=\"17.4\" r=\"1.3\" fill=\"currentColor\" stroke=\"none\"/>",
  "lock":
    "<rect x=\"4.2\" y=\"10.2\" width=\"15.6\" height=\"10.4\" rx=\"2.4\"/><path d=\"M8 10.2V7.4a4 4 0 0 1 8 0v2.8\"/>",
  "mail":
    "<rect x=\"3\" y=\"5\" width=\"18\" height=\"14\" rx=\"2.5\"/><path d=\"m3.8 7.5 8.2 5.8 8.2-5.8\"/>",
  "map-pin":
    "<path d=\"M20 10.2c0 5.8-8 11.6-8 11.6S4 16 4 10.2a8 8 0 0 1 16 0Z\"/><circle cx=\"12\" cy=\"10\" r=\"2.8\"/>",
  "menu":
    "<path d=\"M4 7h16M4 12h16M4 17h16\"/>",
  "message":
    "<path d=\"M21 11.6a8.5 8.5 0 0 1-12.4 7.6L3 21l1.9-5.6A8.5 8.5 0 1 1 21 11.6Z\"/>",
  "moon":
    "<path d=\"M20.4 14.8A8.6 8.6 0 0 1 9.2 3.6a8.6 8.6 0 1 0 11.2 11.2Z\"/>",
  "more":
    "<circle cx=\"5\" cy=\"12\" r=\"1.6\" fill=\"currentColor\" stroke=\"none\"/><circle cx=\"12\" cy=\"12\" r=\"1.6\" fill=\"currentColor\" stroke=\"none\"/><circle cx=\"19\" cy=\"12\" r=\"1.6\" fill=\"currentColor\" stroke=\"none\"/>",
  "phone":
    "<path d=\"M7 3H4.8A1.8 1.8 0 0 0 3 4.9C3 13.2 10.8 21 19.1 21a1.8 1.8 0 0 0 1.9-1.8V17a1 1 0 0 0-.8-1l-3.3-.7a1 1 0 0 0-1 .4l-.9 1.3a13.6 13.6 0 0 1-5.5-5.5l1.3-.9a1 1 0 0 0 .4-1L10.5 6a1 1 0 0 0-1-1Z\"/>",
  "plug":
    "<path d=\"M9 3v6M15 3v6M6.8 9h10.4v3.4a5.2 5.2 0 0 1-10.4 0Z\"/><path d=\"M12 17.6V21\"/>",
  "plus":
    "<path d=\"M12 5v14M5 12h14\"/>",
  "refresh":
    "<path d=\"M20.4 12a8.4 8.4 0 1 1-2.5-6\"/><path d=\"M20.7 4.4V10h-5.6\"/>",
  "scissors":
    "<circle cx=\"6.2\" cy=\"6.2\" r=\"2.6\"/><circle cx=\"6.2\" cy=\"17.8\" r=\"2.6\"/><path d=\"M8.4 7.6 20 19M8.4 16.4 20 5\"/>",
  "search":
    "<circle cx=\"11\" cy=\"11\" r=\"6.8\"/><path d=\"m16 16 5 5\"/>",
  "send":
    "<path d=\"M21 3 10.4 13.6M21 3l-6.8 18-3.8-7.4L3 9.8Z\"/>",
  "share":
    "<circle cx=\"18\" cy=\"5.6\" r=\"2.6\"/><circle cx=\"6\" cy=\"12\" r=\"2.6\"/><circle cx=\"18\" cy=\"18.4\" r=\"2.6\"/><path d=\"m8.3 10.8 7.4-3.9M8.3 13.2l7.4 3.9\"/>",
  "sliders":
    "<path d=\"M6 20.4v-6.2M6 10.2V3.6M12 20.4v-8.6M12 7.8V3.6M18 20.4v-4.2M18 12.2V3.6\"/><path d=\"M3.6 14.2h4.8M9.6 7.8h4.8M15.6 16.2h4.8\"/>",
  "sparkle":
    "<path d=\"M12 3.6 13.9 9 19.4 11l-5.5 2L12 18.4 10.1 13 4.6 11 10.1 9Z\"/><path d=\"M18.6 4v3M17.1 5.5h3\"/>",
  "star":
    "<path d=\"m12 3.8 2.6 5.4 5.9.8-4.3 4.2 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.2 5.9-.8Z\"/>",
  "store":
    "<path d=\"M4 9.4 5.6 4h12.8L20 9.4M4 9.4h16v9.8a1.4 1.4 0 0 1-1.4 1.4H5.4A1.4 1.4 0 0 1 4 19.2Z\"/><path d=\"M4 9.4a2.7 2.7 0 0 0 4 0 2.7 2.7 0 0 0 4 0 2.7 2.7 0 0 0 4 0 2.7 2.7 0 0 0 4 0\"/>",
  "sun":
    "<circle cx=\"12\" cy=\"12\" r=\"4\"/><path d=\"M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.4 5.4l1.6 1.6M17 17l1.6 1.6M18.6 5.4 17 7M7 17l-1.6 1.6\"/>",
  "trash":
    "<path d=\"M4 6.8h16M9.2 6.8V5.4A1.4 1.4 0 0 1 10.6 4h2.8a1.4 1.4 0 0 1 1.4 1.4v1.4M6.6 6.8l.8 12.2a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4l.8-12.2\"/>",
  "user":
    "<circle cx=\"12\" cy=\"8\" r=\"3.8\"/><path d=\"M4.4 20.6a7.6 7.6 0 0 1 15.2 0\"/>",
  "user-plus":
    "<circle cx=\"10\" cy=\"8\" r=\"3.8\"/><path d=\"M2.6 20.6a7.6 7.6 0 0 1 11.9-6.2M19 14.6v5.2M16.4 17.2h5.2\"/>",
  "user-x":
    "<circle cx=\"10\" cy=\"8\" r=\"3.8\"/><path d=\"M2.6 20.6a7.6 7.6 0 0 1 11.6-6.1M17 16.4l4.4 4.4M21.4 16.4 17 20.8\"/>",
  "users":
    "<circle cx=\"9.5\" cy=\"8\" r=\"3.4\"/><path d=\"M3 20.6a6.5 6.5 0 0 1 13 0M16 4.9a3.4 3.4 0 0 1 0 6.2M18 14.6a6.5 6.5 0 0 1 3 6\"/>",
  "wallet":
    "<rect x=\"3\" y=\"6\" width=\"18\" height=\"13\" rx=\"2.4\"/><path d=\"M3 10.2h18\"/><circle cx=\"16.6\" cy=\"14.6\" r=\"1.3\" fill=\"currentColor\" stroke=\"none\"/>",
  "x":
    "<path d=\"M6.2 6.2 17.8 17.8M17.8 6.2 6.2 17.8\"/>",
};

export const TRADE_ICONS: Record<string, string> = {
  "barbier":
    "<path d=\"M7.5 8.5h9v-3a2 2 0 0 0-2-2h-5a2 2 0 0 0-2 2Z\"/><path d=\"M9 3.5v-1.2M11.4 3.5v-1.2M13.8 3.5v-1.2M16.2 3.5v-1.2\"/><path d=\"M8.4 8.5h7.2v10.2a2.6 2.6 0 0 1-2.6 2.6h-2a2.6 2.6 0 0 1-2.6-2.6Z\"/><path d=\"M9.8 12.6h4.4\"/>",
  "coiffure":
    "<circle cx=\"6.2\" cy=\"6.2\" r=\"2.6\"/><circle cx=\"6.2\" cy=\"17.8\" r=\"2.6\"/><path d=\"M8.4 7.6 20 19M8.4 16.4 20 5\"/>",
  "couture":
    "<path d=\"M7.6 4.4h8.8v15.2H7.6z\"/><path d=\"M7.6 7.6h8.8M7.6 16.4h8.8\"/><path d=\"M9.8 10h4.4M9.8 12.4h4.4M9.8 14.8h4.4\"/><path d=\"M16.4 8.4c3 1.2 3.8 3.4 2.6 5.2\"/>",
  "decoration-evenementielle":
    "<path d=\"M2.6 6.4c6.2 4 13 4 19.2 0\"/><path d=\"m6 8.4 1.8 4.8 2.4-4.2M10.6 9.6l1.7 4.8 2.5-4.6M15.3 9.2l1.8 4.6 2.5-5\"/><path d=\"M4 18.6c5 2.6 11 2.6 16 0\"/>",
  "dj-animation":
    "<circle cx=\"10.6\" cy=\"13.4\" r=\"7.2\"/><circle cx=\"10.6\" cy=\"13.4\" r=\"1.6\"/><circle cx=\"19\" cy=\"5.4\" r=\"1.7\"/><path d=\"m17.8 6.6-3.6 3.6\"/>",
  "esthetique":
    "<path d=\"M11 4.4c3.6 4.6 5.4 7.2 5.4 9.8a5.4 5.4 0 0 1-10.8 0c0-2.6 1.8-5.2 5.4-9.8Z\"/><path d=\"M18.6 3.6v3.6M16.8 5.4h3.6\"/>",
  "fleuriste":
    "<circle cx=\"12\" cy=\"8\" r=\"1.9\"/><circle cx=\"15.4\" cy=\"8\" r=\"2\"/><circle cx=\"13.7\" cy=\"11\" r=\"2\"/><circle cx=\"10.3\" cy=\"11\" r=\"2\"/><circle cx=\"8.6\" cy=\"8\" r=\"2\"/><circle cx=\"10.3\" cy=\"5\" r=\"2\"/><circle cx=\"13.7\" cy=\"5\" r=\"2\"/><path d=\"M12 13.2V21\"/><path d=\"M12 17.6c-2.6 0-4.4-1.8-4.4-3.6 2.6 0 4.4 1.8 4.4 3.6Z\"/>",
  "location-salle":
    "<path d=\"M3.4 20.6h17.2\"/><path d=\"M5 20.6V9.2L12 4l7 5.2v11.4\"/><path d=\"M9.6 20.6v-4.8a2.4 2.4 0 0 1 4.8 0v4.8\"/><path d=\"M7.6 11.4h2.2v2.2H7.6zM14.2 11.4h2.2v2.2h-2.2z\"/>",
  "location-vehicule":
    "<path d=\"M4.2 16v-3.5l2.2-5A2 2 0 0 1 8.2 6.2h7.6a2 2 0 0 1 1.8 1.3l2.2 5V16\"/><path d=\"M4.2 12.5h15.6\"/><circle cx=\"8\" cy=\"16.6\" r=\"2.2\"/><circle cx=\"16\" cy=\"16.6\" r=\"2.2\"/><path d=\"M2.6 18.8h18.8\"/>",
  "maquillage":
    "<path d=\"M9.4 21h5.2a1 1 0 0 0 1-1v-8.6H8.4V20a1 1 0 0 0 1 1Z\"/><path d=\"M9.2 11.4 10 5.4h4l.8 6\"/><path d=\"M10 5.4 13.6 2.6l.4 2.8\"/>",
  "onglerie":
    "<path d=\"M9.6 2.8h4.8v3.4H9.6z\"/><path d=\"M10.8 6.2v1.6M13.2 6.2v1.6\"/><path d=\"M8.6 7.8h6.8a1.4 1.4 0 0 1 1.4 1.4v10a2.2 2.2 0 0 1-2.2 2.2H9.4a2.2 2.2 0 0 1-2.2-2.2v-10a1.4 1.4 0 0 1 1.4-1.4Z\"/><path d=\"M9.8 11.4v5.4\"/>",
  "patisserie":
    "<path d=\"M4.6 20.6h14.8v-6.2H4.6Z\"/><path d=\"M4.6 15c2-2 4 2 6 0s4 2 6 0 1.4 1 2.8 0\"/><path d=\"M12 14.4v-3.2\"/><path d=\"M12 11.2c1.6-1 0-2.6 0-2.6s-1.6 1.6 0 2.6Z\"/><path d=\"M3.4 20.6h17.2\"/>",
  "photographie":
    "<path d=\"M4 8h3.4l1.6-2.6h6L16.6 8H20a2 2 0 0 1 2 2v7.6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2Z\"/><circle cx=\"12\" cy=\"13.6\" r=\"3.8\"/>",
  "sonorisation-eclairage":
    "<path d=\"M6.4 3h11.2a1.6 1.6 0 0 1 1.6 1.6v14.8a1.6 1.6 0 0 1-1.6 1.6H6.4a1.6 1.6 0 0 1-1.6-1.6V4.6A1.6 1.6 0 0 1 6.4 3Z\"/><circle cx=\"12\" cy=\"14.4\" r=\"3.6\"/><circle cx=\"12\" cy=\"7.4\" r=\"1.5\"/>",
  "spa-massage":
    "<path d=\"M12 20.4c-1.1-4.6-1.1-8.2 0-11.4 1.1 3.2 1.1 6.8 0 11.4Z\"/><path d=\"M12 20.4c-3.2-3.4-5.2-6.4-5.6-9.6 3.2 1 5.2 4 5.6 9.6Z\"/><path d=\"M12 20.4c3.2-3.4 5.2-6.4 5.6-9.6-3.2 1-5.2 4-5.6 9.6Z\"/><path d=\"M3.8 20.6h16.4\"/>",
  "traiteur":
    "<path d=\"M3.4 19.6h17.2\"/><path d=\"M4.6 19.6a7.4 7.4 0 0 1 14.8 0\"/><path d=\"M12 12.2V9.8\"/><circle cx=\"12\" cy=\"8.4\" r=\"1.4\"/>",
  "tresses":
    "<path d=\"M8.6 4c0 3.2 6.8 3.6 6.8 7.2s-6.8 4-6.8 7.6\"/><path d=\"M15.4 4c0 3.2-6.8 3.6-6.8 7.2s6.8 4 6.8 7.6\"/><path d=\"M7.4 3.4h9.2M10 20.6h4\"/>",
  "video":
    "<path d=\"M3.6 6.8H14a1.6 1.6 0 0 1 1.6 1.6v7.2A1.6 1.6 0 0 1 14 17.2H3.6A1.6 1.6 0 0 1 2 15.6V8.4a1.6 1.6 0 0 1 1.6-1.6Z\"/><path d=\"m15.6 10.6 5.6-3.2v9.2l-5.6-3.2Z\"/>",
};
