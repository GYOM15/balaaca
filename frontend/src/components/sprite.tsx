/**
 * Every glyph the product draws, once, at the root.
 *
 * <p>A sprite rather than a component per icon: the browser parses it once and
 * every `<use>` after that is a reference, which matters on the mid-range
 * telephones this is built for. It also keeps the icons and the trade glyphs in
 * one file, which is what stops them drifting into two visual languages.
 *
 * <p>Rendered with dangerouslySetInnerHTML because it is a static string owned
 * by this repository - there is no interpolation and nothing from a request
 * reaches it.
 */
export function Sprite() {
  return <div hidden dangerouslySetInnerHTML={{ __html: SPRITE }} />;
}

const SPRITE = String.raw`<svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"
     style="position:absolute;width:0;height:0;overflow:hidden" id="bal-sprite">
  <defs>
    <style>
      #bal-sprite symbol { fill: none; stroke: currentColor; stroke-width: 1.6;
        stroke-linecap: round; stroke-linejoin: round; }
      #bal-sprite symbol .fill { fill: currentColor; stroke: none; }
      #bal-sprite symbol .thin { stroke-width: 1.2; }

      /* A scene is not an icon and cannot share its stroke. An icon lives on
         a 24 grid and is drawn around 20 px, where 1.6 lands at a little over
         one pixel. A scene lives on a 200 grid and is drawn up to 460 px as a
         watermark, where the same 1.6 lands at 3.7 - nearly three times the
         line of the sketches it was drawn from. That is the whole difference
         between a pencil and a marker.

         non-scaling-stroke makes the line independent of the scale: the same
         weight on screen whether the scene is a 148 px thumbnail or a 460 px
         section ground. One value instead of one per context. */
      #bal-sprite symbol.scene { stroke-width: 1.1; vector-effect: non-scaling-stroke; }
      #bal-sprite symbol.scene * { vector-effect: non-scaling-stroke; }
    </style>
  </defs>

  <!-- ================= INTERFACE ================= -->
  <symbol id="i-search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></symbol>
  <symbol id="i-pin" viewBox="0 0 24 24"><path d="M12 21s6.5-5.5 6.5-10.5A6.5 6.5 0 0 0 5.5 10.5C5.5 15.5 12 21 12 21Z"/><circle cx="12" cy="10.4" r="2.4"/></symbol>
  <symbol id="i-calendar" viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="15.5" rx="2.2"/><path d="M3.5 9.6h17M8 3.2v3.4M16 3.2v3.4"/></symbol>
  <symbol id="i-calendar-check" viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="15.5" rx="2.2"/><path d="M3.5 9.6h17M8 3.2v3.4M16 3.2v3.4M8.8 14.6l2.2 2.2 4.2-4.4"/></symbol>
  <symbol id="i-calendar-x" viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="15.5" rx="2.2"/><path d="M3.5 9.6h17M8 3.2v3.4M16 3.2v3.4M9.6 13.4l4.8 4.8M14.4 13.4l-4.8 4.8"/></symbol>
  <symbol id="i-clock" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.2V12l3.2 2"/></symbol>
  <symbol id="i-hourglass" viewBox="0 0 24 24"><path d="M7 3.5h10M7 20.5h10M7.6 3.5v3.1c0 2 1.6 3.4 3 4.3.9.6.9 1.6 0 2.2-1.4.9-3 2.3-3 4.3v3.1M16.4 3.5v3.1c0 2-1.6 3.4-3 4.3-.9.6-.9 1.6 0 2.2 1.4.9 3 2.3 3 4.3v3.1"/></symbol>
  <symbol id="i-chevron-right" viewBox="0 0 24 24"><path d="m9.5 5.5 6.4 6.5-6.4 6.5"/></symbol>
  <symbol id="i-chevron-left" viewBox="0 0 24 24"><path d="M14.5 5.5 8.1 12l6.4 6.5"/></symbol>
  <symbol id="i-chevron-down" viewBox="0 0 24 24"><path d="m5.5 9.5 6.5 6.4 6.5-6.4"/></symbol>
  <symbol id="i-chevron-up" viewBox="0 0 24 24"><path d="m5.5 14.5 6.5-6.4 6.5 6.4"/></symbol>
  <symbol id="i-arrow-right" viewBox="0 0 24 24"><path d="M4 12h15.5m-6-6 6 6-6 6"/></symbol>
  <symbol id="i-arrow-left" viewBox="0 0 24 24"><path d="M20 12H4.5m6-6-6 6 6 6"/></symbol>
  <symbol id="i-arrow-up-right" viewBox="0 0 24 24"><path d="M7 17 17 7M8.4 7H17v8.6"/></symbol>
  <symbol id="i-check" viewBox="0 0 24 24"><path d="m4.8 12.6 4.6 4.6L19.2 7"/></symbol>
  <symbol id="i-check-circle" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="m8.2 12.3 2.7 2.7 5-5.2"/></symbol>
  <symbol id="i-circle" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/></symbol>
  <symbol id="i-circle-dot" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><circle class="fill" cx="12" cy="12" r="3"/></symbol>
  <symbol id="i-x" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></symbol>
  <symbol id="i-x-circle" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="m9.4 9.4 5.2 5.2M14.6 9.4l-5.2 5.2"/></symbol>
  <symbol id="i-alert-triangle" viewBox="0 0 24 24"><path d="M10.6 4.1 2.9 17.4a1.6 1.6 0 0 0 1.4 2.4h15.4a1.6 1.6 0 0 0 1.4-2.4L13.4 4.1a1.6 1.6 0 0 0-2.8 0Z"/><path d="M12 9.4v4"/><circle class="fill" cx="12" cy="16.4" r="1"/></symbol>
  <symbol id="i-alert-circle" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.8v4.6"/><circle class="fill" cx="12" cy="15.8" r="1"/></symbol>
  <symbol id="i-info" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 11.4v4.8"/><circle class="fill" cx="12" cy="8.3" r="1"/></symbol>
  <symbol id="i-help" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M9.7 9.6a2.4 2.4 0 1 1 3.2 2.3c-.6.2-.9.8-.9 1.4v.5"/><circle class="fill" cx="12" cy="16.4" r="1"/></symbol>
  <symbol id="i-plus" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></symbol>
  <symbol id="i-minus" viewBox="0 0 24 24"><path d="M5 12h14"/></symbol>
  <symbol id="i-pencil" viewBox="0 0 24 24"><path d="M4 20h4.2l10-10a2.4 2.4 0 0 0-3.4-3.4l-10 10V20Z"/><path d="m13.6 7.4 3.4 3.4"/></symbol>
  <symbol id="i-trash" viewBox="0 0 24 24"><path d="M4.5 6.5h15M9.5 6.5V4.8c0-.7.6-1.3 1.3-1.3h2.4c.7 0 1.3.6 1.3 1.3v1.7M6.3 6.5l.8 12.3c.05.9.8 1.7 1.7 1.7h6.4c.9 0 1.65-.8 1.7-1.7l.8-12.3M10.3 10.5v6M13.7 10.5v6"/></symbol>
  <symbol id="i-image" viewBox="0 0 24 24"><rect x="3.5" y="4.8" width="17" height="14.4" rx="2.2"/><circle cx="8.8" cy="9.8" r="1.5"/><path d="m4 16.5 4.4-4a1.6 1.6 0 0 1 2.2 0l3.6 3.4m0 0 1.8-1.7a1.6 1.6 0 0 1 2.2 0l2.3 2.1M14.2 15.9l1.6 1.5"/></symbol>
  <symbol id="i-camera" viewBox="0 0 24 24"><path d="M3.5 8.6c0-1.2 1-2.2 2.2-2.2h1.9c.6 0 1.2-.3 1.6-.9l.7-1c.3-.5.8-.7 1.4-.7h1.4c.6 0 1.1.3 1.4.7l.7 1c.4.6 1 .9 1.6.9h1.9c1.2 0 2.2 1 2.2 2.2v8.6c0 1.2-1 2.2-2.2 2.2H5.7c-1.2 0-2.2-1-2.2-2.2Z"/><circle cx="12" cy="12.6" r="3.4"/></symbol>
  <symbol id="i-upload" viewBox="0 0 24 24"><path d="M12 15.5V4.2m-4 4 4-4 4 4"/><path d="M4.5 14.5v3.6c0 1.2 1 2.1 2.1 2.1h10.8c1.2 0 2.1-.9 2.1-2.1v-3.6"/></symbol>
  <symbol id="i-download" viewBox="0 0 24 24"><path d="M12 4.2v11.3m-4-4 4 4 4-4"/><path d="M4.5 14.5v3.6c0 1.2 1 2.1 2.1 2.1h10.8c1.2 0 2.1-.9 2.1-2.1v-3.6"/></symbol>
  <symbol id="i-user" viewBox="0 0 24 24"><circle cx="12" cy="8.4" r="3.9"/><path d="M4.6 20.2c.6-3.6 3.7-5.9 7.4-5.9s6.8 2.3 7.4 5.9"/></symbol>
  <symbol id="i-users" viewBox="0 0 24 24"><circle cx="9.6" cy="8.6" r="3.5"/><path d="M2.9 19.8c.6-3.3 3.4-5.4 6.7-5.4s6.1 2.1 6.7 5.4"/><path d="M16.4 5.6a3.5 3.5 0 0 1 .5 6.8M18 14.7c1.7.6 2.9 2 3.2 3.9"/></symbol>
  <symbol id="i-user-plus" viewBox="0 0 24 24"><circle cx="10" cy="8.4" r="3.9"/><path d="M3 20.2c.6-3.6 3.4-5.9 7-5.9 1 0 2 .2 2.8.5"/><path d="M17.6 14.4v6M14.6 17.4h6"/></symbol>
  <symbol id="i-user-check" viewBox="0 0 24 24"><circle cx="10" cy="8.4" r="3.9"/><path d="M3 20.2c.6-3.6 3.4-5.9 7-5.9 1 0 2 .2 2.8.5"/><path d="m15 18 2 2 4-4.2"/></symbol>
  <symbol id="i-phone" viewBox="0 0 24 24"><path d="M8.1 4.2H5.6a2 2 0 0 0-2 2.2C4.2 13.6 10.4 19.8 17.6 20.4a2 2 0 0 0 2.2-2v-2.5a1.4 1.4 0 0 0-1.1-1.4l-2.6-.5a1.4 1.4 0 0 0-1.4.6l-.8 1.1a11.3 11.3 0 0 1-4.4-4.4l1.1-.8c.5-.3.7-.9.6-1.4l-.5-2.6a1.4 1.4 0 0 0-1.4-1.1Z"/></symbol>
  <symbol id="i-whatsapp" viewBox="0 0 24 24"><path d="M3.6 20.4 5 16.3A8.2 8.2 0 1 1 8.2 19.4l-4.6 1Z"/><path d="M9.2 9.1c.2-.5.4-.5.7-.5h.5c.2 0 .4 0 .6.5l.7 1.7c.1.3 0 .5-.1.7l-.4.5c-.1.2-.2.4 0 .7.5.8 1.2 1.5 2 2 .3.2.5.1.7 0l.5-.5c.2-.2.4-.2.6-.1l1.7.8c.3.1.4.3.4.5v.6c0 .3-.2.7-.7.9-.4.2-1 .3-1.6.2-2.9-.5-5.2-2.8-5.7-5.7-.1-.6 0-1.2.1-1.6Z"/></symbol>
  <symbol id="i-share" viewBox="0 0 24 24"><circle cx="17.5" cy="6" r="2.6"/><circle cx="6.5" cy="12" r="2.6"/><circle cx="17.5" cy="18" r="2.6"/><path d="m8.8 10.8 6.4-3.5M8.8 13.2l6.4 3.5"/></symbol>
  <symbol id="i-copy" viewBox="0 0 24 24"><rect x="8.4" y="8.4" width="11.6" height="11.6" rx="2.2"/><path d="M15.6 5.6v-.4a2.2 2.2 0 0 0-2.2-2.2H6.2A2.2 2.2 0 0 0 4 5.2v7.2a2.2 2.2 0 0 0 2.2 2.2h.4"/></symbol>
  <symbol id="i-link" viewBox="0 0 24 24"><path d="M10.2 13.8a3.6 3.6 0 0 0 5.4.4l2.6-2.6a3.6 3.6 0 0 0-5.1-5.1l-1.5 1.5"/><path d="M13.8 10.2a3.6 3.6 0 0 0-5.4-.4l-2.6 2.6a3.6 3.6 0 0 0 5.1 5.1l1.5-1.5"/></symbol>
  <symbol id="i-external" viewBox="0 0 24 24"><path d="M14 4.5h5.5V10M19 5 11.5 12.5"/><path d="M18.2 14v4.3c0 1-.8 1.7-1.7 1.7H5.7c-1 0-1.7-.8-1.7-1.7V7.5c0-1 .8-1.7 1.7-1.7H10"/></symbol>
  <symbol id="i-qr" viewBox="0 0 24 24"><rect x="3.5" y="3.5" width="6.6" height="6.6" rx="1.4"/><rect x="13.9" y="3.5" width="6.6" height="6.6" rx="1.4"/><rect x="3.5" y="13.9" width="6.6" height="6.6" rx="1.4"/><path d="M13.9 13.9h3v3h-3zM20.5 13.9h-1M13.9 20.5h1M17.5 20.5h3v-3"/></symbol>
  <symbol id="i-home" viewBox="0 0 24 24"><path d="M3.8 10.4 12 3.8l8.2 6.6"/><path d="M5.6 11.9v7c0 .8.6 1.4 1.4 1.4h10c.8 0 1.4-.6 1.4-1.4v-7"/><path d="M9.8 20.3v-5h4.4v5"/></symbol>
  <symbol id="i-grid" viewBox="0 0 24 24"><rect x="3.6" y="3.6" width="7.2" height="7.2" rx="1.6"/><rect x="13.2" y="3.6" width="7.2" height="7.2" rx="1.6"/><rect x="3.6" y="13.2" width="7.2" height="7.2" rx="1.6"/><rect x="13.2" y="13.2" width="7.2" height="7.2" rx="1.6"/></symbol>
  <symbol id="i-list" viewBox="0 0 24 24"><path d="M8.6 6.5h11.9M8.6 12h11.9M8.6 17.5h11.9"/><circle class="fill" cx="4.4" cy="6.5" r="1.2"/><circle class="fill" cx="4.4" cy="12" r="1.2"/><circle class="fill" cx="4.4" cy="17.5" r="1.2"/></symbol>
  <symbol id="i-filter" viewBox="0 0 24 24"><path d="M4 6h16M7 12h10M10 18h4"/></symbol>
  <symbol id="i-sliders" viewBox="0 0 24 24"><path d="M4 7.5h4.5M13 7.5h7M4 16.5h7M15.5 16.5h4.5"/><circle cx="10.8" cy="7.5" r="2.3"/><circle cx="13.3" cy="16.5" r="2.3"/></symbol>
  <symbol id="i-menu" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></symbol>
  <symbol id="i-more-h" viewBox="0 0 24 24"><circle class="fill" cx="5.5" cy="12" r="1.5"/><circle class="fill" cx="12" cy="12" r="1.5"/><circle class="fill" cx="18.5" cy="12" r="1.5"/></symbol>
  <symbol id="i-more-v" viewBox="0 0 24 24"><circle class="fill" cx="12" cy="5.5" r="1.5"/><circle class="fill" cx="12" cy="12" r="1.5"/><circle class="fill" cx="12" cy="18.5" r="1.5"/></symbol>
  <symbol id="i-settings" viewBox="0 0 24 24"><circle cx="12" cy="12" r="2.9"/><path d="M12 3.2h.9l.5 2.2c.5.15 1 .35 1.4.6l1.9-1.2.7.5.9.9.5.7-1.2 1.9c.25.45.45.9.6 1.4l2.2.5v1.9l-2.2.5c-.15.5-.35 1-.6 1.4l1.2 1.9-1.4 1.4-1.9-1.2c-.45.25-.9.45-1.4.6l-.5 2.2h-1.9l-.5-2.2c-.5-.15-.95-.35-1.4-.6l-1.9 1.2-1.4-1.4 1.2-1.9c-.25-.45-.45-.9-.6-1.4l-2.2-.5v-1.9l2.2-.5c.15-.5.35-.95.6-1.4L4.7 6.8l1.4-1.4 1.9 1.2c.45-.25.9-.45 1.4-.6l.5-2.2Z"/></symbol>
  <symbol id="i-logout" viewBox="0 0 24 24"><path d="M9.5 4.5H6.2A2.2 2.2 0 0 0 4 6.7v10.6a2.2 2.2 0 0 0 2.2 2.2h3.3"/><path d="M14.4 8.2 18.6 12l-4.2 3.8M18.2 12H9.2"/></symbol>
  <symbol id="i-lock" viewBox="0 0 24 24"><rect x="4.5" y="10" width="15" height="10.2" rx="2.2"/><path d="M8 10V7.6a4 4 0 0 1 8 0V10"/><circle class="fill" cx="12" cy="15.1" r="1.3"/></symbol>
  <symbol id="i-eye" viewBox="0 0 24 24"><path d="M2.6 12S6 6.4 12 6.4 21.4 12 21.4 12 18 17.6 12 17.6 2.6 12 2.6 12Z"/><circle cx="12" cy="12" r="2.9"/></symbol>
  <symbol id="i-eye-off" viewBox="0 0 24 24"><path d="M9.6 7c.8-.3 1.6-.4 2.4-.4 6 0 9.4 5.4 9.4 5.4a17 17 0 0 1-3 3.6M6.1 8.6A16.6 16.6 0 0 0 2.6 12S6 17.6 12 17.6c1.4 0 2.6-.3 3.7-.7"/><path d="m4 4 16 16M9.9 9.9a2.9 2.9 0 0 0 4.1 4.1"/></symbol>
  <symbol id="i-bell" viewBox="0 0 24 24"><path d="M18 9.6a6 6 0 0 0-12 0c0 4.6-1.8 6-1.8 6h15.6s-1.8-1.4-1.8-6Z"/><path d="M13.7 19a2 2 0 0 1-3.4 0"/></symbol>
  <symbol id="i-message" viewBox="0 0 24 24"><path d="M20.4 12.8a7.6 7.6 0 0 1-10.9 6.9L4 20.6l1.1-5a7.6 7.6 0 1 1 15.3-2.8Z"/></symbol>
  <symbol id="i-flag" viewBox="0 0 24 24"><path d="M5.4 21V3.6M5.4 4.6h11.8l-2 3.4 2 3.4H5.4"/></symbol>
  <symbol id="i-shield" viewBox="0 0 24 24"><path d="M12 3.2 4.8 6v5.4c0 4.3 2.9 7.7 7.2 9.4 4.3-1.7 7.2-5.1 7.2-9.4V6Z"/><path d="m9 11.8 2.2 2.2 4-4.2"/></symbol>
  <symbol id="i-shield-alert" viewBox="0 0 24 24"><path d="M12 3.2 4.8 6v5.4c0 4.3 2.9 7.7 7.2 9.4 4.3-1.7 7.2-5.1 7.2-9.4V6Z"/><path d="M12 8.4v4"/><circle class="fill" cx="12" cy="15.4" r="1"/></symbol>
  <symbol id="i-refresh" viewBox="0 0 24 24"><path d="M20 11.5a8 8 0 0 0-13.7-4.8L3.6 9.4"/><path d="M3.6 4.6v4.8h4.8"/><path d="M4 12.5a8 8 0 0 0 13.7 4.8l2.7-2.7"/><path d="M20.4 19.4v-4.8h-4.8"/></symbol>
  <symbol id="i-loader" viewBox="0 0 24 24"><path d="M12 3.5v3.6M12 16.9v3.6M20.5 12h-3.6M7.1 12H3.5M18 6l-2.5 2.5M8.5 15.5 6 18M18 18l-2.5-2.5M8.5 8.5 6 6"/></symbol>
  <symbol id="i-store" viewBox="0 0 24 24"><path d="M4.4 9.4V19c0 .8.6 1.4 1.4 1.4h12.4c.8 0 1.4-.6 1.4-1.4V9.4"/><path d="M3.2 9.4 4.9 4.6c.2-.6.7-1 1.3-1h11.6c.6 0 1.1.4 1.3 1l1.7 4.8a2.6 2.6 0 0 1-4.9 1 2.6 2.6 0 0 1-4.9 0 2.6 2.6 0 0 1-4.9 0 2.6 2.6 0 0 1-4.9-1Z"/><path d="M9.6 20.4v-4.8h4.8v4.8"/></symbol>
  <symbol id="i-briefcase" viewBox="0 0 24 24"><rect x="3.4" y="7.4" width="17.2" height="12.4" rx="2.2"/><path d="M8.8 7.4V5.8c0-.9.7-1.6 1.6-1.6h3.2c.9 0 1.6.7 1.6 1.6v1.6M3.4 12.6c2.7 1.2 5.6 1.8 8.6 1.8s5.9-.6 8.6-1.8M12 13.4v1.8"/></symbol>
  <symbol id="i-tag" viewBox="0 0 24 24"><path d="M11.2 3.6H5a1.4 1.4 0 0 0-1.4 1.4v6.2c0 .4.15.7.4 1l8 8c.55.55 1.45.55 2 0l5.8-5.8c.55-.55.55-1.45 0-2l-8-8c-.3-.25-.6-.4-1-.4Z"/><circle class="fill" cx="8" cy="8" r="1.4"/></symbol>
  <symbol id="i-star" viewBox="0 0 24 24"><path d="m12 3.6 2.6 5.4 5.9.85-4.3 4.15 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.85 9.4 9Z"/></symbol>
  <symbol id="i-sun" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.6v2.4M12 19v2.4M21.4 12H19M5 12H2.6M18.6 5.4 16.9 7.1M7.1 16.9l-1.7 1.7M18.6 18.6l-1.7-1.7M7.1 7.1 5.4 5.4"/></symbol>
  <symbol id="i-sparkle" viewBox="0 0 24 24"><path d="m12 3.4 1.9 5.1 5.1 1.9-5.1 1.9L12 17.4l-1.9-5.1L5 10.4l5.1-1.9Z"/><path d="M18.6 16.4l.8 2.1 2.1.8-2.1.8-.8 2.1-.8-2.1-2.1-.8 2.1-.8Z"/></symbol>
  <symbol id="i-chart" viewBox="0 0 24 24"><path d="M4 20.4h16.4M7 20.4v-6M12 20.4V6.6M17 20.4v-9"/></symbol>
  <symbol id="i-inbox" viewBox="0 0 24 24"><path d="M3.6 13.6h4l1.4 2.6h6l1.4-2.6h4"/><path d="M6.3 4.6h11.4c.7 0 1.3.4 1.5 1.1l2.2 7.2c.05.2.1.4.1.6v4.8c0 1.1-.9 2-2 2H4.5c-1.1 0-2-.9-2-2v-4.8c0-.2.05-.4.1-.6l2.2-7.2c.2-.7.8-1.1 1.5-1.1Z"/></symbol>
  <symbol id="i-door" viewBox="0 0 24 24"><path d="M3.6 20.4h16.8M6.6 20.4V4.8c0-.7.5-1.3 1.2-1.4l7.6-1.1c.8-.1 1.6.5 1.6 1.4v16.7"/><circle class="fill" cx="14" cy="12.4" r="1.1"/></symbol>
  <symbol id="i-drag" viewBox="0 0 24 24"><circle class="fill" cx="9" cy="6" r="1.4"/><circle class="fill" cx="15" cy="6" r="1.4"/><circle class="fill" cx="9" cy="12" r="1.4"/><circle class="fill" cx="15" cy="12" r="1.4"/><circle class="fill" cx="9" cy="18" r="1.4"/><circle class="fill" cx="15" cy="18" r="1.4"/></symbol>
  <symbol id="i-printer" viewBox="0 0 24 24"><path d="M7 8.6V4.4c0-.5.4-.9.9-.9h8.2c.5 0 .9.4.9.9v4.2"/><path d="M7 17.4H5.4a2 2 0 0 1-2-2v-4.8a2 2 0 0 1 2-2h13.2a2 2 0 0 1 2 2v4.8a2 2 0 0 1-2 2H17"/><rect x="7" y="14.2" width="10" height="6.3" rx="1"/></symbol>
  <symbol id="i-globe" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M3.6 12h16.8"/><path d="M12 3.5c2.1 2.3 3.3 5.3 3.3 8.5s-1.2 6.2-3.3 8.5c-2.1-2.3-3.3-5.3-3.3-8.5S9.9 5.8 12 3.5Z"/></symbol>
  <symbol id="i-note" viewBox="0 0 24 24"><path d="M19.4 12.6V6.2a2.2 2.2 0 0 0-2.2-2.2H6.8a2.2 2.2 0 0 0-2.2 2.2v11.6A2.2 2.2 0 0 0 6.8 20h6.2"/><path d="M8.2 8.6h7.6M8.2 12.2h5.4M13 20l6.4-6.4"/><path d="M13 20v-3.2h3.2"/></symbol>
  <symbol id="i-history" viewBox="0 0 24 24"><path d="M3.6 12a8.4 8.4 0 1 0 2.5-6"/><path d="M3.6 4.8v4.2h4.2"/><path d="M12 7.6V12l3 1.8"/></symbol>
  <symbol id="i-ban" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="m6 6 12 12"/></symbol>
  <symbol id="i-play" viewBox="0 0 24 24"><path d="M7.6 4.9 19 12 7.6 19.1Z"/></symbol>
  <symbol id="i-scan" viewBox="0 0 24 24"><path d="M3.6 8.6V6.2a2.6 2.6 0 0 1 2.6-2.6h2.4M15.4 3.6h2.4A2.6 2.6 0 0 1 20.4 6.2v2.4M20.4 15.4v2.4a2.6 2.6 0 0 1-2.6 2.6h-2.4M8.6 20.4H6.2a2.6 2.6 0 0 1-2.6-2.6v-2.4"/><path d="M7 12h10"/></symbol>

  <!-- ================= MODES DE SERVICE ================= -->
  <!-- Trois glyphes construits en famille : même socle, même lecture. -->
  <symbol id="i-mode-onsite" viewBox="0 0 24 24"><path d="M4.4 20.4V9.8L12 4l7.6 5.8v10.6"/><path d="M3 20.4h18"/><circle cx="12" cy="12.6" r="1.9"/><path d="M8.9 18.1c.35-1.6 1.6-2.6 3.1-2.6s2.75 1 3.1 2.6"/></symbol>
  <symbol id="i-mode-dropoff" viewBox="0 0 24 24"><path d="M12 3.4 20.2 7v6.2c0 .6-.3 1.1-.8 1.4l-6.6 3.8c-.5.3-1.1.3-1.6 0l-6.6-3.8a1.6 1.6 0 0 1-.8-1.4V7Z"/><path d="M3.8 7 12 11.4 20.2 7M12 11.4v7.6"/><path d="M15.5 18.8a4 4 0 1 0 4 4 4 4 0 0 0-4-4Z" style="display:none"/><path d="M8.4 20.6h2.2M17.4 4.6l-2.6 1.2"/></symbol>
  <symbol id="i-mode-atcustomer" viewBox="0 0 24 24"><path d="M3.2 18.4V11l6.6-5 6.6 5v7.4"/><path d="M2 18.4h15.6"/><path d="M7.6 18.4v-4.2h4.4v4.2"/><path d="M18.6 6.6c1.8 0 3.2 1.4 3.2 3.2 0 2.2-3.2 5.2-3.2 5.2s-3.2-3-3.2-5.2c0-1.8 1.4-3.2 3.2-3.2Z"/><circle class="fill" cx="18.6" cy="9.8" r="1.1"/></symbol>

  <!-- ================= GLYPHES MÉTIERS =================
       35 métiers, 8 familles. Identifiant = slug du métier côté API.
       Les 17 métiers qui n'avaient pas de glyphe en ont un, construit dans
       exactement le même langage : grille 24, trait 1.6, angles arrondis,
       currentColor. Aucun glyphe n'est emprunté à une autre bibliothèque. -->

  <!-- famille : beaute -->
  <symbol id="t-coiffure" viewBox="0 0 24 24"><path d="M7.6 3.6c-1.6 2.6-1.9 5.4-.9 8.4M16.4 3.6c1.6 2.6 1.9 5.4.9 8.4"/><path d="M12 3.2c-1 3.2-1 5.8 0 8.8 1-3 1-5.6 0-8.8Z"/><circle cx="6.4" cy="17.4" r="3"/><circle cx="17.6" cy="17.4" r="3"/><path d="M9.2 16.4h5.6"/></symbol>
  <symbol id="t-barbier" viewBox="0 0 24 24"><circle cx="6.6" cy="17.6" r="2.8"/><circle cx="17.4" cy="17.6" r="2.8"/><path d="M8.6 15.6 17.6 4.4M15.4 15.6 6.4 4.4"/><path d="M11 11.9 12.6 10"/></symbol>
  <symbol id="t-tresses" viewBox="0 0 24 24"><path d="M8.4 3.4c2.4 2.2-2.4 4.2 0 6.4s-2.4 4.2 0 6.4-2.4 3-.6 4.4M12 3.4c2.4 2.2-2.4 4.2 0 6.4s-2.4 4.2 0 6.4-2.4 3-.6 4.4M15.6 3.4c2.4 2.2-2.4 4.2 0 6.4s-2.4 4.2 0 6.4-2.4 3-.6 4.4"/></symbol>
  <symbol id="t-esthetique" viewBox="0 0 24 24"><path d="M12 3.4c3 3.4 4.6 6.2 4.6 8.8a4.6 4.6 0 0 1-9.2 0c0-2.6 1.6-5.4 4.6-8.8Z"/><path d="M9.8 12.6a2.4 2.4 0 0 0 2.4 2.4"/><path d="M6 19.4c1.8 1 3.8 1.5 6 1.5s4.2-.5 6-1.5"/></symbol>
  <symbol id="t-maquillage" viewBox="0 0 24 24"><path d="M14.4 3.6h3.2l1.4 5.4c.15.6-.3 1.2-.9 1.2h-4.2c-.6 0-1.05-.6-.9-1.2Z"/><path d="M13.6 10.2v8.4c0 1-.8 1.8-1.8 1.8h-.4c-1 0-1.8-.8-1.8-1.8v-8.4"/><path d="M9.6 14.4h4M4.6 7.2h4M6.6 5.2v4"/></symbol>
  <symbol id="t-onglerie" viewBox="0 0 24 24"><path d="M9 20.4V9.6c0-3.4 1.2-6.2 3-6.2s3 2.8 3 6.2v10.8Z"/><path d="M9.1 8.6h5.8"/><path d="M4.8 20.4h14.4"/></symbol>

  <!-- famille : bien-etre -->
  <symbol id="t-spa-massage" viewBox="0 0 24 24"><path d="M12 20.4c0-4.6-2.6-8-7.4-9 .6 5 3.2 8.2 7.4 9Z"/><path d="M12 20.4c0-4.6 2.6-8 7.4-9-.6 5-3.2 8.2-7.4 9Z"/><path d="M12 20.4c-1.8-3.4-1.8-7 0-10.6 1.8 3.6 1.8 7.2 0 10.6Z"/><circle cx="12" cy="5" r="1.8"/></symbol>
  <symbol id="t-coach-sportif" viewBox="0 0 24 24"><path d="M2.6 10.4v3.2M5.4 8v8M18.6 8v8M21.4 10.4v3.2"/><rect x="5.4" y="8.6" width="3" height="6.8" rx="1.1"/><rect x="15.6" y="8.6" width="3" height="6.8" rx="1.1"/><path d="M8.4 12h7.2"/></symbol>

  <!-- famille : atelier -->
  <symbol id="t-couture" viewBox="0 0 24 24"><path d="M20.4 3.6 8.6 15.4l-2.2 4.4 4.4-2.2L20.4 3.6Z"/><path d="M17 7 9.4 14.6"/><circle cx="18.9" cy="5.1" r="1.5"/><path d="M6.4 4.6c-2 1.4-2.4 3.6-1 5.4"/></symbol>

  <!-- famille : evenement -->
  <symbol id="t-photographie" viewBox="0 0 24 24"><path d="M3.6 9c0-1.2 1-2.2 2.2-2.2h1.6c.6 0 1.1-.3 1.4-.8l.8-1.2c.3-.5.8-.8 1.4-.8h2c.6 0 1.1.3 1.4.8l.8 1.2c.3.5.8.8 1.4.8h1.6c1.2 0 2.2 1 2.2 2.2v8.2c0 1.2-1 2.2-2.2 2.2H5.8c-1.2 0-2.2-1-2.2-2.2Z"/><circle cx="12" cy="12.6" r="3.6"/><circle class="fill" cx="17.4" cy="9.6" r="0.9"/></symbol>
  <symbol id="t-video" viewBox="0 0 24 24"><rect x="3" y="6.6" width="12.4" height="10.8" rx="2.2"/><path d="M15.4 11.2 21 8.2v7.6l-5.6-3Z"/><path d="M6.4 6.6v10.8"/></symbol>
  <symbol id="t-dj-animation" viewBox="0 0 24 24"><circle cx="12" cy="13.6" r="7"/><circle cx="12" cy="13.6" r="2.2"/><path d="M12 3.4a10 10 0 0 1 8 4"/><path d="M17.4 9.4 20.6 6"/></symbol>
  <symbol id="t-sonorisation-eclairage" viewBox="0 0 24 24"><rect x="6.4" y="3.6" width="11.2" height="16.8" rx="2.2"/><circle cx="12" cy="14.4" r="3.2"/><circle cx="12" cy="7.6" r="1.6"/><path d="M3.4 8.6v6.8M20.6 8.6v6.8"/></symbol>
  <symbol id="t-decoration-evenementielle" viewBox="0 0 24 24"><path d="M12 3.4c2.8 0 5 2.2 5 5 0 3.4-5 8-5 8s-5-4.6-5-8c0-2.8 2.2-5 5-5Z"/><path d="M12 16.4v4.2M9.4 20.6h5.2"/><path d="M4.4 5.6 6 7.2M19.6 5.6 18 7.2M3.4 11.4h2M18.6 11.4h2"/></symbol>
  <symbol id="t-fleuriste" viewBox="0 0 24 24"><circle cx="12" cy="7.4" r="2.4"/><path d="M12 5c0-1.6-1.1-2.9-2.4-2.9S7.2 3.4 7.2 5s1.1 2.4 2.4 2.4M12 5c0-1.6 1.1-2.9 2.4-2.9S16.8 3.4 16.8 5s-1.1 2.4-2.4 2.4M9.6 7.4c-1.6 0-2.9 1.1-2.9 2.4s1.3 2.4 2.9 2.4M14.4 7.4c1.6 0 2.9 1.1 2.9 2.4s-1.3 2.4-2.9 2.4"/><path d="M12 12.2v8.4M12 16.6c-1.8-.4-2.8-1.6-3-3.4 1.8-.2 2.8.8 3 3.4ZM12 18.6c1.8-.4 2.8-1.6 3-3.4-1.8-.2-2.8.8-3 3.4Z"/></symbol>
  <symbol id="t-location-salle" viewBox="0 0 24 24"><path d="M2.6 20.4h18.8"/><path d="M4.6 20.4V8.6l7.4-4.8 7.4 4.8v11.8"/><rect x="8.4" y="12.4" width="7.2" height="8"/><path d="M12 12.4v8"/></symbol>

  <!-- famille : table -->
  <symbol id="t-traiteur" viewBox="0 0 24 24"><path d="M3.4 15.6h17.2c0-4.8-3.85-8.2-8.6-8.2S3.4 10.8 3.4 15.6Z"/><path d="M2.4 18.6h19.2"/><path d="M12 7.4V4.6"/><circle class="fill" cx="12" cy="3.4" r="1"/></symbol>
  <symbol id="t-patisserie" viewBox="0 0 24 24"><path d="M5.6 11.4h12.8l-1.3 8.2c-.1.6-.6 1-1.2 1H8.1c-.6 0-1.1-.4-1.2-1Z"/><path d="M5.6 11.4c0-3.5 2.9-6.2 6.4-6.2s6.4 2.7 6.4 6.2"/><path d="M12 5.2V3.2M8.4 11.4c0-1.4 1.6-2.4 3.6-2.4s3.6 1 3.6 2.4"/></symbol>

  <!-- famille : auto -->
  <symbol id="t-mecanique-auto" viewBox="0 0 24 24"><path d="M15.8 3.8a4.8 4.8 0 0 0-4.5 6.4L4 17.4a2 2 0 0 0 2.8 2.8l7.2-7.2a4.8 4.8 0 0 0 6.1-6.3l-2.6 2.6-2.5-.6-.6-2.5Z"/><circle class="fill" cx="5.4" cy="18.6" r="0.9"/></symbol>
  <symbol id="t-mecanique-moto" viewBox="0 0 24 24"><circle cx="5" cy="16.4" r="3.4"/><circle cx="19" cy="16.4" r="3.4"/><path d="M5 16.4h4.2l4-6.4h3.4l2.4 6.4"/><path d="M9.4 10h4.6M12.2 10 10 16.4"/><path d="M14.6 6.4h2.6l1.2 3.6"/></symbol>
  <symbol id="t-location-vehicule" viewBox="0 0 24 24"><path d="M3.6 16.4v-3.2l2-4.6c.3-.7 1-1.2 1.8-1.2h9.2c.8 0 1.5.5 1.8 1.2l2 4.6v3.2"/><path d="M3.6 13.4h16.8"/><circle cx="7.4" cy="17.4" r="1.9"/><circle cx="16.6" cy="17.4" r="1.9"/><path d="M9.4 17.4h5.2"/></symbol>
  <symbol id="t-auto-ecole" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.4"/><circle cx="12" cy="12" r="3"/><path d="M12 3.6v5.4M4.4 15.4l5.1-1.9M19.6 15.4l-5.1-1.9"/></symbol>
  <symbol id="t-lavage-auto" viewBox="0 0 24 24"><path d="M4.4 17.4v-2.6l1.7-3.9c.25-.6.85-1 1.5-1h7.8c.65 0 1.25.4 1.5 1l1.7 3.9v2.6"/><path d="M4.4 14.8h15.2"/><circle cx="7.8" cy="18.2" r="1.6"/><circle cx="16.2" cy="18.2" r="1.6"/><path d="M6.6 8.2c0-1.2-1.4-2-1.4-3.4a1.4 1.4 0 0 1 2.8 0c0 1.4-1.4 2.2-1.4 3.4ZM17.4 8.2c0-1.2-1.4-2-1.4-3.4a1.4 1.4 0 0 1 2.8 0c0 1.4-1.4 2.2-1.4 3.4ZM12 6.6c0-1.2-1.4-2-1.4-3.4a1.4 1.4 0 0 1 2.8 0c0 1.4-1.4 2.2-1.4 3.4Z"/></symbol>

  <!-- famille : maison -->
  <symbol id="t-plomberie" viewBox="0 0 24 24"><path d="M4.4 6.4h4.2v4.2c0 2.6 2.1 4.8 4.8 4.8h1.8"/><rect x="2.6" y="4.2" width="3.6" height="4.4" rx="1"/><rect x="15" y="13" width="4.4" height="4.4" rx="1"/><path d="M19.4 15.2h2M8.6 4.4v4M11.4 15.2v4.4"/></symbol>
  <symbol id="t-electricite" viewBox="0 0 24 24"><path d="M13.4 2.6 6.2 13.4h5l-1.6 8 8.2-11.4h-5.2Z"/></symbol>
  <symbol id="t-climatisation" viewBox="0 0 24 24"><rect x="3" y="5.4" width="18" height="7.2" rx="2"/><path d="M6.4 9h11.2"/><path d="M7.4 15.4c0 1.4-.8 2-.8 3.2M12 15.4c0 1.8-1 2.4-1 4M16.6 15.4c0 1.4-.8 2-.8 3.2"/></symbol>
  <symbol id="t-energie-solaire" viewBox="0 0 24 24"><path d="M3.4 20.4h17.2l-2.4-7.6H5.8Z"/><path d="M8.6 12.8 7 20.4M15.4 12.8 17 20.4M4.7 16.6h14.6"/><circle cx="12" cy="5.4" r="2.4"/><path d="M12 1.8v.9M12 8.1v.9M15.4 5.4h.9M7.7 5.4h.9M14.4 3v0M9.6 7.8v0"/></symbol>
  <symbol id="t-nettoyage" viewBox="0 0 24 24"><path d="M9.4 3.4h2.6l1 8.4H8.4Z"/><path d="M8.4 11.8h4.6v5.6c0 1.8-1 3.2-2.3 3.2s-2.3-1.4-2.3-3.2Z"/><path d="M15.4 6.6h5M15.4 10.6h5M15.4 14.6h5"/></symbol>
  <symbol id="t-demenagement" viewBox="0 0 24 24"><path d="M2.6 15.6V8.4c0-.8.6-1.4 1.4-1.4h9.2c.8 0 1.4.6 1.4 1.4v7.2"/><path d="M14.6 10.4h2.8c.5 0 1 .3 1.2.7l2.4 4c.1.2.2.4.2.7v1.8"/><path d="M2.4 15.6h18.8"/><circle cx="6.6" cy="17.4" r="1.9"/><circle cx="16.4" cy="17.4" r="1.9"/></symbol>
  <symbol id="t-desinsectisation" viewBox="0 0 24 24"><rect x="12.4" y="9" width="7.2" height="11.4" rx="2"/><path d="M14.6 9V6.4h2.8V9M16 3.4v3M13.4 4.6l-1.8-1M13.4 6.8l-2.2.6"/><path d="M5.6 6.4a2.6 2.6 0 0 1 5.2 0c0 1.6-1.2 2.6-2.6 2.6S5.6 8 5.6 6.4Z"/><path d="M8.2 9v4.2M6 10.4l-2.4-1M10.4 10.4l1.2-.6M6 13l-2.4 1.4M4.6 5.4 3 4.2M11.6 5 13 4"/></symbol>
  <symbol id="t-reparation-telephone" viewBox="0 0 24 24"><rect x="5.6" y="2.6" width="9.6" height="18.8" rx="2.4"/><path d="M9.2 5.4h2.4"/><path d="M17.4 11.6a2.9 2.9 0 0 0-3.9 3.7l-1.1 1.1 2.4 2.4 1.1-1.1a2.9 2.9 0 0 0 3.7-3.9l-1.5 1.5-1.7-.4-.4-1.7Z"/></symbol>
  <symbol id="t-securite-electronique" viewBox="0 0 24 24"><path d="M12 3.2 4.8 6v5.4c0 4.3 2.9 7.7 7.2 9.4 4.3-1.7 7.2-5.1 7.2-9.4V6Z"/><circle cx="12" cy="10.6" r="2"/><path d="M8.8 16.6c.4-1.8 1.7-2.8 3.2-2.8s2.8 1 3.2 2.8"/></symbol>

  <!-- famille : savoir -->
  <symbol id="t-cours-particuliers" viewBox="0 0 24 24"><path d="M12 4 2.8 8.4 12 12.8l9.2-4.4Z"/><path d="M6.4 10.4v5c0 1.8 2.5 3.2 5.6 3.2s5.6-1.4 5.6-3.2v-5M21.2 8.4v5.4"/></symbol>
  <symbol id="t-cours-langues" viewBox="0 0 24 24"><path d="M3.4 5.6a1.8 1.8 0 0 1 1.8-1.8h6.6a1.8 1.8 0 0 1 1.8 1.8v4.6a1.8 1.8 0 0 1-1.8 1.8H8.2L5 14.8v-2.8a1.8 1.8 0 0 1-1.6-1.8Z"/><path d="M10.4 12v2.2a1.8 1.8 0 0 0 1.8 1.8h3.6l3.2 2.8V16a1.8 1.8 0 0 0 1.6-1.8V9.6a1.8 1.8 0 0 0-1.8-1.8h-4.4"/><path d="M6 7.6h4.4M6.8 9.8h2.8"/></symbol>
  <symbol id="t-formation-professionnelle" viewBox="0 0 24 24"><rect x="3" y="3.6" width="18" height="12.4" rx="2"/><path d="M8 20.4h8M12 16v4.4"/><path d="M8.2 11.6 10.6 9l1.8 1.8L16 6.8"/></symbol>

  <symbol id="t-default" viewBox="0 0 24 24"><rect x="3.6" y="6.6" width="16.8" height="13.8" rx="2.2"/><path d="M8.6 6.6V5.4c0-1 .8-1.8 1.8-1.8h3.2c1 0 1.8.8 1.8 1.8v1.2M3.6 12.4c2.6 1.2 5.4 1.8 8.4 1.8s5.8-.6 8.4-1.8"/></symbol>

  <!-- ================= FAMILLES ================= -->
  <symbol id="f-beaute" viewBox="0 0 24 24"><path d="M12 3.4c3 3.4 4.6 6.2 4.6 8.8a4.6 4.6 0 0 1-9.2 0c0-2.6 1.6-5.4 4.6-8.8Z"/><path d="M9.8 12.6a2.4 2.4 0 0 0 2.4 2.4"/><path d="M6 19.4c1.8 1 3.8 1.5 6 1.5s4.2-.5 6-1.5"/></symbol>
  <symbol id="f-bien-etre" viewBox="0 0 24 24"><path d="M12 20.4c0-4.6-2.6-8-7.4-9 .6 5 3.2 8.2 7.4 9Z"/><path d="M12 20.4c0-4.6 2.6-8 7.4-9-.6 5-3.2 8.2-7.4 9Z"/><circle cx="12" cy="5" r="1.8"/><path d="M12 20.4c-1.8-3.4-1.8-7 0-10.6 1.8 3.6 1.8 7.2 0 10.6Z"/></symbol>
  <symbol id="f-atelier" viewBox="0 0 24 24"><path d="M20.4 3.6 8.6 15.4l-2.2 4.4 4.4-2.2L20.4 3.6Z"/><path d="M17 7 9.4 14.6"/><circle cx="18.9" cy="5.1" r="1.5"/></symbol>
  <symbol id="f-evenement" viewBox="0 0 24 24"><path d="m12 3.4 1.9 5.1 5.1 1.9-5.1 1.9L12 17.4l-1.9-5.1L5 10.4l5.1-1.9Z"/><path d="M18.6 16.4l.8 2.1 2.1.8-2.1.8-.8 2.1-.8-2.1-2.1-.8 2.1-.8Z"/></symbol>
  <symbol id="f-table" viewBox="0 0 24 24"><path d="M3.4 15.6h17.2c0-4.8-3.85-8.2-8.6-8.2S3.4 10.8 3.4 15.6Z"/><path d="M2.4 18.6h19.2M12 7.4V4.6"/></symbol>
  <symbol id="f-auto" viewBox="0 0 24 24"><path d="M3.6 16.4v-3.2l2-4.6c.3-.7 1-1.2 1.8-1.2h9.2c.8 0 1.5.5 1.8 1.2l2 4.6v3.2"/><path d="M3.6 13.4h16.8"/><circle cx="7.4" cy="17.4" r="1.9"/><circle cx="16.6" cy="17.4" r="1.9"/></symbol>
  <symbol id="f-maison" viewBox="0 0 24 24"><path d="M3.8 10.4 12 3.8l8.2 6.6"/><path d="M5.6 11.9v7c0 .8.6 1.4 1.4 1.4h10c.8 0 1.4-.6 1.4-1.4v-7"/><path d="M9.8 20.3v-5h4.4v5"/></symbol>
  <symbol id="f-savoir" viewBox="0 0 24 24"><path d="M12 4 2.8 8.4 12 12.8l9.2-4.4Z"/><path d="M6.4 10.4v5c0 1.8 2.5 3.2 5.6 3.2s5.6-1.4 5.6-3.2v-5M21.2 8.4v5.4"/></symbol>

  <!-- ================= SCÈNES =================
       Croquis au trait, monochromes, currentColor. Servent d'états vides et
       de respiration éditoriale. Jamais de remplissage décoratif. -->
  <symbol id="s-storefront" viewBox="0 0 200 150" class="scene">
    <path d="M28 62v66h144V62"/><path d="M16 62l14-30h140l14 30Z"/>
    <path d="M16 62c0 8 7 14 16 14s16-6 16-14c0 8 7 14 16 14s16-6 16-14c0 8 7 14 16 14s16-6 16-14c0 8 7 14 16 14s16-6 16-14c0 8 7 14 16 14s16-6 16-14"/>
    <path d="M66 128V92h32v36" /><rect x="118" y="90" width="34" height="26" rx="2"/>
    <path d="M118 103h34M135 90v26"/><path d="M12 128h176"/>
    <path class="thin" d="M84 108v6"/>
  </symbol>
  <symbol id="s-notebook" viewBox="0 0 200 150" class="scene">
    <path d="M42 26h108a8 8 0 0 1 8 8v96a8 8 0 0 1-8 8H42Z"/>
    <path d="M42 26a10 10 0 0 0-10 10v92a10 10 0 0 0 10 10"/>
    <path class="thin" d="M62 56h74M62 74h74M62 92h52"/>
    <path d="M120 118l34-34a7 7 0 0 1 10 10l-34 34-14 4Z"/>
    <path class="thin" d="M146 92l10 10"/>
  </symbol>
  <symbol id="s-chair" viewBox="0 0 200 150" class="scene">
    <path d="M62 74V44a12 12 0 0 1 12-12h22a12 12 0 0 1 12 12v30"/>
    <path d="M54 74h62a6 6 0 0 1 6 6v10a6 6 0 0 1-6 6H54a6 6 0 0 1-6-6V80a6 6 0 0 1 6-6Z"/>
    <path d="M85 96v22M64 132h42M85 118c-12 0-21 6-21 14M85 118c12 0 21 6 21 14"/>
    <path d="M122 84h20a8 8 0 0 1 8 8v14"/><circle cx="150" cy="112" r="7"/>
    <path class="thin" d="M74 52h22"/>
  </symbol>
  <symbol id="s-braiding" viewBox="0 0 200 150" class="scene">
    <path d="M100 24c-20 0-34 14-34 32 0 10 4 16 4 24"/>
    <path d="M100 24c20 0 34 14 34 32 0 10-4 16-4 24"/>
    <path d="M70 80c0 16 13 28 30 28s30-12 30-28"/>
    <path d="M78 96c6 6-4 12 2 18s-4 12 2 18M100 108c6 6-4 12 2 18s-4 12 2 18M122 96c-6 6 4 12-2 18s4 12-2 18"/>
    <path class="thin" d="M86 66c4-4 10-4 14 0M100 66c4-4 10-4 14 0"/>
  </symbol>
  <symbol id="s-mechanic" viewBox="0 0 200 150" class="scene">
    <circle cx="76" cy="70" r="30"/><circle cx="76" cy="70" r="11"/>
    <path d="M76 40v12M76 88v12M46 70h12M94 70h12M55 49l8 8M97 91l-8-8M97 49l-8 8M55 91l8-8"/>
    <path d="M144 44a18 18 0 0 0-17 24l-22 22a8 8 0 0 0 11 11l22-22a18 18 0 0 0 23-24l-10 10-9-2-2-9Z"/>
    <path d="M28 126h144"/>
  </symbol>
  <symbol id="s-photographer" viewBox="0 0 200 150" class="scene">
    <path d="M60 34h80a10 10 0 0 1 10 10v34a10 10 0 0 1-10 10H60a10 10 0 0 1-10-10V44a10 10 0 0 1 10-10Z"/>
    <circle cx="100" cy="61" r="17"/><circle cx="100" cy="61" r="7"/>
    <path d="M76 34l6-10h36l6 10"/><circle class="fill" cx="134" cy="46" r="3.5"/>
    <path d="M100 88v14M100 102 74 132M100 102l26 30M86 118h28"/>
  </symbol>
  <symbol id="s-tailor" viewBox="0 0 200 150" class="scene">
    <path d="M100 20a10 10 0 0 1 10 10c0 6-4 8-4 12h-12c0-4-4-6-4-12a10 10 0 0 1 10-10Z"/>
    <path d="M94 42h12l16 12c6 4 8 10 8 17v13H70V71c0-7 2-13 8-17Z"/>
    <path d="M70 84h60l-6 30H76Z"/><path d="M100 114v22M84 136h32"/>
    <path class="thin" d="M56 60c-8 6-8 18 0 24s20 2 24-6"/>
    <path class="thin" d="M62 66v12M68 68v8"/>
  </symbol>
  <symbol id="s-tools" viewBox="0 0 200 150" class="scene">
    <path d="M40 66h120a6 6 0 0 1 6 6v50a6 6 0 0 1-6 6H40a6 6 0 0 1-6-6V72a6 6 0 0 1 6-6Z"/>
    <path d="M74 66V52a10 10 0 0 1 10-10h32a10 10 0 0 1 10 10v14"/>
    <path d="M34 92h132M88 84h24v16H88Z"/>
    <path d="M148 40a14 14 0 0 0-13 19l-13 13 8 8 13-13a14 14 0 0 0 19-13l-8 8-7-2-2-7Z"/>
    <path class="thin" d="M56 108h20M124 108h20"/>
  </symbol>
</svg>`;

/**
 * The trades the sprite actually draws, read from the sprite itself.
 *
 * <p>Read rather than listed, so a trade added to one and not the other cannot
 * pass unnoticed: a `use` pointing at a symbol that is not there draws nothing
 * at all, which reads as a layout bug rather than as a missing drawing.
 * Computed once when the module loads.
 */
export const TRADE_GLYPHS: ReadonlySet<string> = new Set(
  Array.from(SPRITE.matchAll(/id="t-([a-z0-9-]+)"/g), (m) => m[1]!),
);
