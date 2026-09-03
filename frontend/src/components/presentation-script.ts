// @ts-nocheck
/*
 * The mockup's presentation script, vendored.
 *
 * <p>Not type-checked, and that is the decision rather than an omission. This
 * block is copied from the design source and will be REPLACED WHOLESALE the
 * next time the design changes, so every annotation written into it is work
 * thrown away - and a mistranslation here breaks an animation, not a booking.
 *
 * <p>What keeps that safe is the boundary, not the types: nothing in this file
 * reads the API, holds a session, or decides anything. It copies to the
 * clipboard, opens a dialog, previews a chosen file, shows or hides a
 * conditional field, raises a toast, and reveals a section on scroll. Every
 * value the product owns stays on the server.
 *
 * <p>The prototype's hash router was removed on the way in: Next has real
 * routes, which index and can be shared, and two routers fighting over the
 * back button is a bug nobody enjoys finding.
 */
/*
 * Ported verbatim below this line, and typed rather than rewritten.
 *
 * <p>`any` appears where the original walked the DOM without narrowing. That is
 * deliberate: this block is vendored from the design source and will be
 * replaced wholesale the next time the design changes, so hand-tightening it
 * would be work thrown away - and a mistranslation here is a broken animation,
 * not a broken booking.
 */
export function boot(teardown) {
  const on = (
    target: EventTarget,
    type: string,
    handler: EventListenerOrEventListenerObject,
    options?: AddEventListenerOptions,
  ) => {
    target.addEventListener(type, handler, options);
    teardown.push(() => target.removeEventListener(type, handler, options));
  };

  /* ---------- 2. Copy ---------------------------------------------------- */
    on(document, 'click', function (e: any) {
      var b = (e.target as Element).closest<HTMLElement>('[data-copy]');
      if (!b) return;
      var text = b.getAttribute('data-copy') ?? '';
      (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () {
        toast({ tone: 'success', title: 'Copié', body: text });
      }, function () { toast({ tone: 'info', title: 'Copie indisponible', body: text }); });
    });
  
    /* ---------- 3. Dialog -------------------------------------------------- */
    on(document, 'click', function (e: any) {
      var open = (e.target as Element).closest<HTMLElement>('[data-dialog-open]');
      if (open) { var d = document.getElementById(open.getAttribute('data-dialog-open') ?? ''); if (d && (d as HTMLDialogElement).showModal) { e.preventDefault(); (d as HTMLDialogElement).showModal(); } return; }
      var close = (e.target as Element).closest<HTMLElement>('[data-dialog-close]');
      if (close) { var dd = close.closest('dialog'); if (dd) { e.preventDefault(); (dd as HTMLDialogElement).close(); } }
    });
  
    /* ---------- 4. Optimistic button -------------------------------------- */
    on(document, 'click', function (e: any) {
      var found = (e.target as Element).closest<HTMLElement>('[data-optimistic]');
      if (!found) return;
      var b: HTMLElement = found;
      e.preventDefault();
      if (b.dataset.busy === 'true') return;
      b.dataset.busy = 'true'; b.dataset.done = 'false';
      setTimeout(function () {
        b.dataset.busy = 'false'; b.dataset.done = 'true';
        toast({ tone: 'success', title: b.getAttribute('data-optimistic') || 'Enregistré' });
        setTimeout(function () { b.dataset.done = 'false'; }, 2600);
      }, 700);
    });
  
    /* ---------- 5. Toasts -------------------------------------------------- */
    var ICONS: Record<string, string> = { success: 'i-check-circle', danger: 'i-alert-circle', info: 'i-info' };
    function toast(o: any) {
      var region: HTMLElement | null = document.querySelector('.toast-region');
      if (!region) { region = document.createElement('div'); region.className = 'toast-region'; region.setAttribute('role', 'status'); region.setAttribute('aria-live', 'polite'); document.body.appendChild(region); }
      var el = document.createElement('div');
      el.className = 'toast toast--' + (o.tone || 'info');
      el.innerHTML = '<span class="toast__icon"><svg class="ico" aria-hidden="true"><use href="#' + (ICONS[o.tone] || ICONS.info) + '"></use></svg></span>' +
        '<div class="grow"><div class="toast__title"></div>' + (o.body ? '<div class="toast__body"></div>' : '') + '</div>' +
        '<button class="toast__close" aria-label="Fermer"><svg class="ico ico--sm" aria-hidden="true"><use href="#i-x"></use></svg></button>';
      el.querySelector('.toast__title').textContent = o.title || '';
      if (o.body) el.querySelector('.toast__body').textContent = o.body;
      el.querySelector('.toast__close').addEventListener('click', function () { el.remove(); });
      region.appendChild(el);
      setTimeout(function () { el.remove(); }, 4800);
    }
    (window as any).balToast = toast;
  
    /* ---------- 6. File preview ------------------------------------------- */
    on(document, 'change', function (e: any) {
      var input = (e.target as Element).closest<HTMLElement>('input[type=file][data-preview]');
      if (!input || !input.files || !input.files[0]) return;
      var target = document.getElementById(input.getAttribute('data-preview'));
      if (!target) return;
      var f = input.files[0];
      if (f.size > 5 * 1024 * 1024) { toast({ tone: 'danger', title: 'Fichier trop lourd', body: '5 Mo maximum. Celui-ci fait ' + Math.round(f.size / 1e5) / 10 + ' Mo.' }); input.value = ''; return; }
      if (!/^image\/(jpeg|png)$/.test(f.type)) { toast({ tone: 'danger', title: 'Format non accepté', body: 'JPEG ou PNG uniquement.' }); input.value = ''; return; }
      var url = URL.createObjectURL(f);
      target.innerHTML = '<img src="' + url + '" alt="">' + '<span class="photo__tag">Envoi…</span><div class="photo__progress progress"><div class="progress__bar" style="width:12%"></div></div>';
      var bar = target.querySelector('.progress__bar'), p = 12;
      var t = setInterval(function () {
        p += 18; bar.style.width = Math.min(p, 100) + '%';
        if (p >= 100) { clearInterval(t); target.querySelector('.photo__tag').textContent = 'Ajoutée'; setTimeout(function(){ var tag = target.querySelector('.photo__tag'); if (tag) tag.remove(); var pr = target.querySelector('.photo__progress'); if (pr) pr.remove(); }, 900); toast({ tone: 'success', title: 'Photo ajoutée', body: 'Redimensionnée à 1600 px, métadonnées supprimées.' }); }
      }, 220);
    });
  
    /* ---------- 7. Conditional fields ------------------------------------- */
    function syncReveals(scope) {
      (scope || document).querySelectorAll('[data-reveal-group]').forEach(function (group) {
        var name = group.getAttribute('data-reveal-group');
        var checked = group.querySelector('input[name="' + name + '"]:checked');
        var v = checked ? checked.value : null;
        group.querySelectorAll('[data-reveal-when]').forEach(function (panel) {
          var match = panel.getAttribute('data-reveal-when').split(',').indexOf(v) > -1;
          panel.hidden = !match;
        });
      });
    }
    on(document, 'change', function (e: any) { if (e.target.matches('input[type=radio]')) syncReveals(); });
  
    /* ---------- 9. Reveal on scroll ---------------------------------------- */
    var io = null;
    if ('IntersectionObserver' in window) {
      io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e: any) {
          if (!e.isIntersecting) return;
          e.target.classList.add('is-in');
          io.unobserve(e.target);
        });
      }, { rootMargin: '0px 0px -6% 0px', threshold: 0.06 });
    }
    function observe(scope) {
      if (!io) return;
      (scope || document).querySelectorAll('[data-reveal],[data-reveal-group]').forEach(function (el: any) {
        if (el.classList.contains('is-in')) return;
        io.observe(el);
      });
    }
  
    /* ---------- 10. Scroll state ------------------------------------------- */
    var ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        document.documentElement.classList.toggle('is-scrolled', window.scrollY > 8);
        ticking = false;
      });
    }
  
    /* ---------- 11. Trade catalogue filter --------------------------------- */
    on(document, 'input', function (e: any) {
      var input = (e.target as Element).closest<HTMLElement>('[data-trade-filter]');
      if (!input) return;
      var scope = document.querySelector('.route:not([hidden]) [data-trade-scope]') || document.querySelector('[data-trade-scope]');
      if (!scope) return;
      var q = input.value.trim().toLowerCase();
      var shown = 0;
      scope.querySelectorAll('[data-family-block]').forEach(function (block) {
        var visible = 0;
        block.querySelectorAll('[data-trade-name]').forEach(function (el: any) {
          var match = !q || el.getAttribute('data-trade-name').indexOf(q) > -1;
          el.hidden = !match;
          if (match) visible++;
        });
        block.hidden = visible === 0;
        var c = block.querySelector('[data-family-count]');
        if (c) c.textContent = visible + (visible > 1 ? ' métiers' : ' métier');
        shown += visible;
      });
      var none = scope.querySelector('[data-trade-empty]');
      if (none) none.hidden = shown > 0;
      /* Looked up by attribute, never by id: in the single-file prototype the
         identifiers were prefixed per route. */
      var count = (input.closest('.route') || document).querySelector('[data-trade-count-label]');
      if (count) count.textContent = shown === 0 ? 'Aucun métier ne correspond.'
        : shown + (shown > 1 ? ' métiers affichés.' : ' métier affiché.');
    });
  
  /* ---------- Boot ------------------------------------------------------- */
  // No collect() and no hashchange: those belonged to the prototype router.
  // Everything else the original boot() did is below, unchanged - including
  // the scope it observed, which resolves to the one .route the layout draws.
  document.documentElement.classList.add('js');
  syncReveals();
  observe(document.querySelector('.route:not([hidden])') || document);
  on(window, 'scroll', onScroll, { passive: true });
  onScroll();

  // The observer outlives the listeners and holds every node it still watches,
  // so a teardown that only unbinds events leaks one per boot.
  teardown.push(function () { if (io) io.disconnect(); });

  // What the prototype's router called on a screen change, handed back so the
  // Next equivalent can call the same two functions instead of re-booting.
  return { observe: observe, syncReveals: syncReveals };
}
