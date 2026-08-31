import Link from "next/link";
import { notFound } from "next/navigation";
import { ApiError, publicApi } from "@/lib/api";
import { dateTime, money } from "@/lib/format";
import type { CustomerBooking } from "@/lib/types";
import { cancel } from "./actions";

export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = {
  PENDING: "En attente de confirmation par le salon",
  CONFIRMED: "Confirme",
  CANCELLED: "Annule",
  COMPLETED: "Termine",
  NO_SHOW: "Non honore",
};

/**
 * A customer's own appointment, reachable by its reference alone.
 *
 * <p>No account, no sign-in: the reference is the handle, it is what the
 * confirmation message carries, and it is what this URL is. Anything else would
 * mean asking somebody to create an account to look at a haircut they have
 * already booked.
 */
export default async function BookingPage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = await params;

  let booking: CustomerBooking;
  try {
    booking = await publicApi<CustomerBooking>(
      `/v1/bookings/${encodeURIComponent(reference)}`,
    );
  } catch (error) {
    // A reference that names nothing and one at a suspended business answer
    // identically, and so does this page.
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  // The provider's own zone, sent with the booking. A customer reading "14:00"
  // wants the time at the salon, not the time where their phone happens to be,
  // and the browser's zone is the one thing here that is nobody's business.
  const zone = booking.timezone;
  // The API already decided this, and re-deciding it here would be the drift
  // that puts a button in front of a customer the server is about to refuse:
  // cancellable_until is ABSENT - not a date in the past - once the window has
  // closed or the appointment is no longer open. Its presence is the answer.
  const cancellable = booking.cancellable_until !== undefined;

  return (
    <main>
      <h1>Votre rendez-vous</h1>
      <p>
        Reference <strong>{booking.reference}</strong> — gardez-la, c'est le seul
        moyen de revenir sur cette page.
      </p>

      <table>
        <tbody>
          <tr>
            <th>Chez</th>
            <td>
              <Link href={`/p/${booking.provider_slug}`}>{booking.provider_name}</Link>
            </td>
          </tr>
          <tr>
            <th>Prestation</th>
            <td>{booking.service_name}</td>
          </tr>
          <tr>
            <th>Avec</th>
            <td>{booking.staff_name}</td>
          </tr>
          <tr>
            <th>Quand</th>
            <td>{dateTime(booking.starts_at, zone)}</td>
          </tr>
          <tr>
            <th>Prix</th>
            <td>{money(booking.price)}</td>
          </tr>
          <tr>
            <th>Statut</th>
            <td>{STATUS[booking.status] ?? booking.status}</td>
          </tr>
        </tbody>
      </table>

      {cancellable ? (
        <form action={cancel}>
          <input type="hidden" name="reference" value={booking.reference} />
          <label>
            Motif (facultatif)
            <input type="text" name="reason" maxLength={200} />
          </label>
          <button type="submit">Annuler ce rendez-vous</button>
        </form>
      ) : (
        <p>
          Ce rendez-vous ne peut plus etre annule en ligne. Appelez le salon si
          vous avez un empechement.
        </p>
      )}
    </main>
  );
}
