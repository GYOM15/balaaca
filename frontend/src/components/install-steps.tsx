import type { ReactNode } from "react";
import { Icon } from "@/components/icon";

/**
 * How to put this on a home screen, written once.
 *
 * <p>It was written twice - in the floating sheet and on "Mon compte" - and
 * both copies said the same wrong thing, which is what a duplicated sentence
 * is for. `install-offer.ts` states the rule in its own comment: on iOS every
 * browser is WebKit and every one of them reaches Add to Home Screen, "just
 * not all from the same button. The copy must therefore not name one." Both
 * copies named Safari. Somebody on Chrome was told to look in a bar that does
 * not belong to their browser.
 *
 * <p>So the iOS steps describe the ICON and not a browser. The share glyph is
 * the same square-and-arrow in Safari, in Chrome and in Firefox; where it sits
 * is not, and asserting a position would be the same mistake with different
 * words.
 */

/**
 * The share sheet, on any iOS browser.
 *
 * <p>The last line exists because the option is not always there. Apple
 * guarantees Add to Home Screen from SAFARI's share sheet; a third-party
 * browser on iOS carries it or does not depending on its version, and
 * somebody scrolling a sheet that simply has no such entry has no way to
 * know that. Naming Safari as the way out is not the mistake this list was
 * fixed for: the mistake was assuming it in the step that says where to
 * press.
 */
export const IOS_STEPS: ReactNode[] = [
  <>
    Appuyez sur <Icon name="share" size={16} /> <strong>Partager</strong>,
    l’icône carrée avec une flèche vers le haut. Elle est dans la barre du
    navigateur, ou dans son menu.
  </>,
  <>
    Faites défiler, puis choisissez{" "}
    <strong>«&nbsp;Sur l’écran d’accueil&nbsp;»</strong>.
  </>,
  <>
    Appuyez sur <strong>Ajouter</strong>, en haut à droite.
  </>,
  <>
    Vous ne trouvez pas «&nbsp;Sur l’écran d’accueil&nbsp;»&nbsp;? Ouvrez la
    même page dans <strong>Safari</strong> et recommencez&nbsp;: sur iPhone,
    c’est le seul navigateur où Apple garantit cette option.
  </>,
];

/**
 * Android and the desktop, where the browser's own menu carries it.
 *
 * <p>Two wordings, because Chromium names the item one way when it judges the
 * page installable and the other when it does not, and a provider hunting for
 * the exact phrase finds neither if only one is printed.
 */
export const MENU_STEPS: ReactNode[] = [
  <>Ouvrez le menu du navigateur, en haut à droite.</>,
  <>
    Choisissez <strong>«&nbsp;Installer l’application&nbsp;»</strong> ou{" "}
    <strong>«&nbsp;Ajouter à l’écran d’accueil&nbsp;»</strong>.
  </>,
];

/** The same list, drawn the same way, wherever it is shown. */
export function InstallSteps({ steps, flush }: { steps: ReactNode[]; flush?: boolean }) {
  return (
    <ol className="install-steps" style={flush ? { marginTop: 0 } : undefined}>
      {steps.map((step, index) => (
        <li key={index}>{step}</li>
      ))}
    </ol>
  );
}
