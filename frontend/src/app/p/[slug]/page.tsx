import Link from "next/link";
import { publicApi } from "@/lib/api";
import { day, isoDate, money, time } from "@/lib/format";
import type {
  AvailableSlotPage,
  PublicOpeningHours,
  PublicProvider,
  PublicStaffList,
} from "@/lib/types";
import { book } from "./actions";

/** Live availability. Cached, it would send a customer to a slot that is gone. */
export const dynamic = "force-dynamic";

const DAYS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];

/** Why a booking was refused, in the words a customer can act on. */
const REFUSALS: Record<string, string> = {
  SLOT_UNAVAILABLE: "Ce creneau vient d'etre pris. Choisissez-en un autre.",
  SLOT_OUTSIDE_AVAILABILITY: "Ce creneau n'est plus proposé. Rechargez la page.",
  VALIDATION_FAILED: "Verifiez le nom et le numero de telephone.",
  RATE_LIMITED: "Trop de demandes en meme temps. Reessayez dans un instant.",
};

export default async function ProviderPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ service?: string; staff?: string; from?: string; error?: string }>;
}) {
  const { slug } = await params;
  const query = await searchParams;

  const [provider, hours, staff] = await Promise.all([
    publicApi<PublicProvider>(`/v1/providers/${encodeURIComponent(slug)}`),
    publicApi<PublicOpeningHours>(`/v1/providers/${encodeURIComponent(slug)}/opening-hours`),
    publicApi<PublicStaffList>(`/v1/providers/${encodeURIComponent(slug)}/staff`),
  ]);

  const service =
    provider.services.find((s) => s.service_offering_id === query.service) ??
    provider.services[0];

  const from = query.from ?? isoDate(new Date());
  const to = isoDate(new Date(Date.parse(`${from}T00:00:00Z`) + 6 * 86_400_000));

  // Only asked once a service is chosen: a slot's length comes from the
  // service's own duration and buffers, so there is no such thing as a slot
  // list for a provider in general.
  const slots = service
    ? await publicApi<AvailableSlotPage>(
        `/v1/providers/${encodeURIComponent(slug)}/available-slots`,
        {
          query: {
            service_offering_id: service.service_offering_id,
            staff_id: query.staff || undefined,
            from,
            to,
            limit: 100,
          },
        },
      )
    : { data: [], next_cursor: null };

  return (
    <main>
      <p>
        <Link href="/">← Rechercher</Link>
      </p>
      <h1>{provider.business_name}</h1>
      {provider.description ? <p>{provider.description}</p> : null}
      <p>
        {[provider.address_line, provider.city].filter(Boolean).join(", ")}
        {provider.public_phone_e164 ? ` — ${provider.public_phone_e164}` : null}
      </p>

      <h2>Horaires</h2>
      <ul>
        {hours.data.map((segment, index) => (
          <li key={`${segment.day_of_week}-${index}`}>
            {DAYS[segment.day_of_week - 1]} : {segment.start_time} – {segment.end_time}
          </li>
        ))}
      </ul>

      <h2>Prendre rendez-vous</h2>

      {query.error ? (
        <p className="problem">
          {REFUSALS[query.error] ?? "La demande n'a pas abouti. Reessayez."}
        </p>
      ) : null}

      {/* GET, so choosing a service or a week is a link the browser can go
          back to, and the slot list below is simply what that URL says. */}
      <form method="get">
        <div className="row">
          <label>
            Prestation
            <select name="service" defaultValue={service?.service_offering_id ?? ""}>
              {provider.services.map((one) => (
                <option key={one.service_offering_id} value={one.service_offering_id}>
                  {one.name} — {one.duration_minutes} min
                  {one.price ? ` — ${money(one.price)}` : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            Avec qui
            <select name="staff" defaultValue={query.staff ?? ""}>
              <option value="">Peu importe</option>
              {staff.data.map((person) => (
                <option key={person.staff_id} value={person.staff_id}>
                  {person.display_name}
                </option>
              ))}
            </select>
          </label>
          <label>
            A partir du
            <input type="date" name="from" defaultValue={from} />
          </label>
          <button type="submit">Voir les creneaux</button>
        </div>
      </form>

      {!service ? (
        <p>Ce professionnel ne propose aucune prestation pour le moment.</p>
      ) : slots.data.length === 0 ? (
        <p>Aucun creneau sur cette periode. Essayez la semaine suivante.</p>
      ) : (
        <form action={book}>
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="service_offering_id" value={service.service_offering_id} />
          <input type="hidden" name="staff_id" value={query.staff ?? ""} />

          <label>
            Creneau
            <select name="starts_at" required>
              {slots.data.map((slot) => (
                <option key={slot.starts_at} value={slot.starts_at}>
                  {day(slot.starts_at, provider.timezone)} a{" "}
                  {time(slot.starts_at, provider.timezone)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Votre nom
            <input type="text" name="full_name" required maxLength={120} />
          </label>
          <label>
            Telephone
            <input type="tel" name="phone" required maxLength={24} placeholder="622 00 00 01" />
          </label>
          <label>
            Message pour le salon (facultatif)
            <textarea name="customer_note" maxLength={500} rows={2} />
          </label>
          <button type="submit">Reserver</button>
        </form>
      )}
    </main>
  );
}
