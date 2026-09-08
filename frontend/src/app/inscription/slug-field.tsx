"use client";

import { useState } from "react";
import { Icon } from "@/components/icon";
import { normaliseSlug } from "@/lib/slug";

/**
 * The handle, and the link it becomes, shown as it is typed.
 *
 * <p>The field used to carry the whole address: the host and `/p/` were drawn
 * inside the box as a prefix, and the input was pushed clear of them with
 * `paddingLeft: 9.5rem`. That number was a GUESS at how wide the prefix would
 * render, and it cannot be right - the host comes from configuration, so its
 * width is not known when the padding is written. On a telephone with
 * `balaaca.ecclify.com` it was too narrow and the prefix sat on top of what the
 * person was typing.
 *
 * <p>Taking the prefix out of the box removes the coupling rather than
 * correcting it. There is no width left to guess, and the address is shown
 * whole underneath instead, which reads better than a box the eye has to
 * assemble.
 *
 * <p>The preview lower-cases, because the server does: `register` sends
 * `.trim().toLowerCase()`. Showing what was typed would promise an address that
 * is not the one they get.
 */
export function SlugField({
  host,
  defaultValue,
  taken,
  suggestion,
}: {
  host: string;
  defaultValue: string;
  taken: boolean;
  suggestion?: string;
}) {
  const [handle, setHandle] = useState(() => normaliseSlug(defaultValue));

  return (
    <div className="field">
      <label className="field__label" htmlFor="slug">
        Votre lien <span className="field__req" aria-hidden="true">*</span>
      </label>
      <input
        className="input"
        id="slug"
        name="slug"
        type="text"
        required
        minLength={3}
        maxLength={60}
        // The contract's own pattern, to the character. The browser refuses a
        // malformed handle before the round trip; the server refuses it again,
        // because a pattern in HTML is a convenience and never a guarantee.
        pattern="[a-z0-9]([a-z0-9-]{1,58}[a-z0-9])"
        inputMode="url"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        autoComplete="off"
        value={handle}
        onChange={(event) => setHandle(normaliseSlug(event.target.value))}
        placeholder="salon-aissatou"
        aria-describedby="slug_preview slug_hint"
        aria-invalid={taken ? true : undefined}
      />

      {/* aria-live, so somebody using a screen reader hears the address settle
          rather than discovering it after submitting. Polite: it must not
          interrupt every keystroke. */}
      <p className="slug-preview" id="slug_preview" aria-live="polite">
        Vos clients verront{" "}
        <span className="slug-preview__url">
          {host}/p/
          <strong>{handle || "salon-aissatou"}</strong>
        </span>
      </p>

      {taken ? (
        // The refusal replaces the hint, under the box it is about, with a
        // neighbouring handle to try. Only the server knows what is free, so it
        // is offered rather than substituted.
        <p className="field__error" id="slug_hint">
          <Icon name="alert-circle" size={16} /> Ce lien est déjà pris.
          {suggestion ? (
            <>
              {" "}
              Essayez <strong>{suggestion}</strong>.
            </>
          ) : null}
        </p>
      ) : (
        <p className="field__hint" id="slug_hint">
          <Icon name="lock" size={16} /> Ce lien ne changera jamais : il sera
          imprimé sur votre QR code et envoyé à vos clients.
        </p>
      )}
    </div>
  );
}
