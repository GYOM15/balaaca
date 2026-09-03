# Opening the WhatsApp account

Everything on the Balaaca side is written and tested against a fake server that
speaks the Graph API. What is missing is an account, and this is how to get one.

Read the whole page before starting. Two steps take days rather than minutes,
and both of them are easier to begin early than to hurry later.

## The decision, before any of it

**One Balaaca number, not one number per salon.** One account to verify, one
quota to watch, one set of templates to keep approved, and a salon that leaves
does not take the number with it. Every message therefore arrives from Balaaca
and names the business in its text, which is what the eight templates below
already do.

The alternative - each provider registering their own number - means a Meta
verification per salon and a support burden nobody has time for.

## 1. A business portfolio

<https://business.facebook.com>

Create a portfolio for Balaaca. Use an address and a legal name that match the
documents you will upload in step 2; a mismatch is the usual reason a
verification is refused.

## 2. Business verification, and start it TODAY

Business Settings, then Security Centre, then Start Verification.

This is the long pole. It wants a legal document proving the business exists
and a document proving the address - in Guinea, the RCCM extract and the NIF.
Review takes anything from two days to two weeks, and it can come back asking
for a different document.

Until it passes, the account stays on a starter tier: a small number of unique
recipients per day, which is enough to test and not enough to launch.

## 3. A developer app

<https://developers.facebook.com/apps>

Create an app of type **Business**, then add the **WhatsApp** product to it.

You immediately get a **test number** and a temporary token that lasts 24 hours.
The test number sends only to five recipients you list by hand, and it is free.
It is worth wiring first, because it proves the whole path before any money or
verification is involved.

## 4. The real number

WhatsApp Manager, then Phone Numbers, then Add.

**The number must not be in use on the ordinary WhatsApp app.** If it is,
delete that account from the phone first and wait - the number stays held for a
while. Buying a fresh SIM for this is the usual answer and the cheapest one.

You verify it by SMS or by voice call.

## 5. A permanent token

Business Settings, then Users, then System Users. Create one, assign it to the
app from step 3, then Generate Token with these two permissions:

    whatsapp_business_messaging
    whatsapp_business_management

**Not the temporary token from step 3**, which expires in 24 hours, and not a
token tied to your personal account, which dies with it.

## 6. The three values Balaaca needs

| Where it comes from | What to put it in |
| --- | --- |
| WhatsApp Manager, next to the number | `WHATSAPP_PHONE_NUMBER_ID` |
| WhatsApp Manager, the account header | `WHATSAPP_BUSINESS_ACCOUNT_ID` |
| The system user token from step 5 | `WHATSAPP_ACCESS_TOKEN` |

They go in `.env` at the repository root, and the worker reads them when
`balaaca.notification.channel` includes `whatsapp`.

## 7. The eight templates

This is the part Meta's own documentation cannot give you: the exact names and
the exact ORDER of the parameters. The worker fills them positionally, so a
template approved with its parameters in a different order sends a message that
is wrong rather than one that fails.

Create them in WhatsApp Manager, then Message Templates. Category **Utility**
for all eight: they follow an action the person took, so they are not marketing
and must not be filed as such. Language **French (fr)**.

Five go to the customer, and their three parameters are always
`{{1}}` the business, `{{2}}` the service, `{{3}}` the time:

| Template name | When it is sent |
| --- | --- |
| `booking_confirmation` | the booking is taken and needs no confirming |
| `booking_accepted` | the provider accepted a booking that was pending |
| `booking_reminder` | the day before |
| `booking_cancellation` | the appointment was called off |
| `booking_reschedule` | it moved |

Three go to the provider, and their parameters are `{{1}}` the CUSTOMER,
`{{2}}` the service, `{{3}}` the time. The business name would tell a provider
nothing; whose appointment it is, is the whole message:

| Template name | When it is sent |
| --- | --- |
| `booking_notice` | somebody booked |
| `cancellation_notice` | somebody cancelled |
| `reschedule_notice` | somebody moved theirs |

A body that works, for `booking_confirmation`:

    Votre rendez-vous chez {{1}} est confirmé.
    {{2}}, le {{3}}.
    Pour le déplacer ou l'annuler, ouvrez le lien de votre réservation.

Approval is usually minutes and occasionally a day. A template is rejected for
naming a price, for reading as an advertisement, or for an unused parameter.

## 8. What it costs

Meta charges per message, by category, and Utility is the cheap one. A free
allowance covers a service conversation started by the customer within 24
hours. Set a spending limit in Business Settings before you launch, not after.

## 9. Turning it on

    balaaca.notification.channel=whatsapp,smtp

Leave `console` in the list on a development machine and nothing is delivered by
accident. The worker refuses to start if the channel is selected and the phone
number id or the token is blank, which is deliberate: a worker that starts
without them would drain the outbox into nothing and mark every row sent.
