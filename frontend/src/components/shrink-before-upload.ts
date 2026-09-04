/**
 * Resizes a chosen photograph in the browser, before the form sends it.
 *
 * <p>A cover uploaded from a telephone is three to five megabytes. It failed
 * with a bare `403` on the server action, with nothing logged anywhere and no
 * message on screen - so the provider was told the upload had worked (by a
 * toast that fired on CHOOSING the file), then dropped on a page saying the
 * fault was ours. Two lies about the same event.
 *
 * <p>Raising a limit would have moved that wall, not removed it. This removes
 * it: the API stores at most {@link LONG_EDGE} pixels on the long edge anyway,
 * so every byte above that was uploaded to be thrown away. On a mid-range
 * Android over 3G - the market this is for - that is the difference between a
 * few seconds and a minute of a progress bar nobody trusts.
 *
 * <p>On SUBMIT and not on change, deliberately. Resizing is asynchronous, and a
 * change handler that starts it cannot stop the form being submitted with the
 * original file a moment later: the race is silent and wins about half the
 * time. Here the submit is held, the file replaced, and the form re-submitted.
 *
 * <p>It never blocks. Anything the canvas cannot do - an exotic colour space, a
 * browser without `DataTransfer`, a decode that throws - falls through with the
 * original file, and the server's own limits answer as they did before. A
 * convenience that can refuse an upload is not a convenience.
 */

/** What the API keeps. Above this, the bytes are uploaded only to be discarded. */
const LONG_EDGE = 1600;

/** Below this, resizing costs more than it saves. */
const LEAVE_ALONE = 512 * 1024;

/**
 * 0.82, measured rather than picked: on the photographs this product carries -
 * braids, fabric, tiled walls - 0.9 is indistinguishable at three times the
 * weight, and 0.7 shows on the repeating patterns first.
 */
const QUALITY = 0.82;

async function shrink(file: File): Promise<File> {
  // createImageBitmap decodes off the main thread, so a large photograph does
  // not freeze the page while it is read.
  const bitmap = await createImageBitmap(file);
  try {
    const longest = Math.max(bitmap.width, bitmap.height);
    if (longest <= LONG_EDGE) return file;

    const scale = LONG_EDGE / longest;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));

    const context = canvas.getContext("2d");
    if (!context) return file;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    // PNG stays PNG: a logo's transparency is the reason it is a PNG, and
    // re-encoding it as JPEG would flatten it onto black in the canvas.
    const type = file.type === "image/png" ? "image/png" : "image/jpeg";
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, type, type === "image/jpeg" ? QUALITY : undefined),
    );
    if (!blob || blob.size >= file.size) return file;

    return new File([blob], file.name, { type, lastModified: file.lastModified });
  } finally {
    bitmap.close();
  }
}

/** @returns a teardown, for the caller that registered it */
export function shrinkBeforeUpload(): () => void {
  const resubmitting = new WeakSet<HTMLFormElement>();

  const onSubmit = (event: Event) => {
    const form = event.target as HTMLFormElement | null;
    if (!(form instanceof HTMLFormElement)) return;

    // Our own re-submission, coming back round. Cleared here rather than after
    // requestSubmit so that a form which fails to submit is not left marked.
    if (resubmitting.has(form)) {
      resubmitting.delete(form);
      return;
    }

    const input = form.querySelector<HTMLInputElement>("input[type=file][data-shrink]");
    const file = input?.files?.[0];
    if (!input || !file || file.size <= LEAVE_ALONE) return;
    if (typeof DataTransfer === "undefined" || typeof createImageBitmap === "undefined") {
      return;
    }

    // Capture phase, so this runs before the framework's own submit handler and
    // the action never sees the original file.
    event.preventDefault();
    event.stopPropagation();

    void shrink(file)
      .then((smaller) => {
        if (smaller !== file) {
          const carrier = new DataTransfer();
          carrier.items.add(smaller);
          input.files = carrier.files;
        }
      })
      .catch(() => {
        // Left as it arrived. The server still has the last word on size.
      })
      .finally(() => {
        resubmitting.add(form);
        form.requestSubmit();
      });
  };

  document.addEventListener("submit", onSubmit, true);
  return () => document.removeEventListener("submit", onSubmit, true);
}
