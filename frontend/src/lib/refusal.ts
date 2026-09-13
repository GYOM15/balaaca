/**
 * What survives a refused booking.
 *
 * <p>One function rather than the same condition written in the server action
 * and again in the page. They are the two halves of a single decision - the
 * action puts the hour back in the URL, the page reads it and lands on the
 * form - and split across two files they are exactly the shape this codebase
 * keeps paying for: two places that must agree, with nothing checking that
 * they do.
 */

/**
 * Whether the hour the customer chose is still worth carrying back.
 *
 * <p>`VALIDATION_FAILED` is a refusal of the BOXES: the slot was fine and a
 * telephone number was not, so sending the customer to the hour list cost them
 * the slot as well as the digit. Every other refusal in the catalogue is about
 * the hour itself - taken, withdrawn, contended - and the screen that exists to
 * replace it must not open with the dead one in its recap.
 */
export function refusalKeepsTheHour(code: string | null | undefined): boolean {
  return code === "VALIDATION_FAILED";
}
