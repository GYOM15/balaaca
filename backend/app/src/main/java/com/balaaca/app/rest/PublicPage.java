package com.balaaca.app.rest;

import com.balaaca.app.api.model.Fulfilment;
import com.balaaca.app.api.model.LocalityRef;
import com.balaaca.app.api.model.Money;
import com.balaaca.app.api.model.PublicOpeningHours;
import com.balaaca.app.api.model.PublicOpeningHoursSegment;
import com.balaaca.app.api.model.PublicProviderView;
import com.balaaca.app.api.model.PublicServiceOffering;
import com.balaaca.app.api.model.PublicStaffList;
import com.balaaca.app.api.model.PublicStaffMember;
import com.balaaca.app.api.model.ReviewSummary;
import com.balaaca.catalog.ports.inbound.PublishedCatalogueUseCase.PublishedService;
import com.balaaca.providers.ports.inbound.LookupPublicProviderUseCase.PublicProvider;
import com.balaaca.providers.ports.inbound.LookupPublicStaffUseCase.BookableStaff;
import com.balaaca.providers.ports.inbound.PublishedReviewsUseCase;
import com.balaaca.scheduling.domain.OpenWindow;
import java.util.List;
import java.util.Optional;

/**
 * A provider's public page, as a payload.
 *
 * <p>Its own class because TWO routes serve this page now: the public one, and
 * the owner's preview of it. The preview exists because the public route
 * resolves through a published-only lookup, so a business that has not
 * published has nothing there to look at - and four dashboard screens linked to
 * it anyway.
 *
 * <p>Assembling the preview out of the dashboard's own endpoints was the
 * obvious alternative and it is the one that rots: two sources of truth for one
 * page, disagreeing on the first change either side. Here there is one, and a
 * field added to the page appears in the preview because it cannot not.
 *
 * <p>Static and stateless. It reads nothing and decides nothing: the tenant is
 * already bound by whichever resource called it - from a slug on one path, from
 * the token on the other - and that is the whole difference between them.
 */
final class PublicPage {

    /** Where a stored name becomes something a browser can fetch. */
    static final String MEDIA = ProviderProfileResource.MEDIA;

    private PublicPage() {
    }

    static PublicProviderView view(PublicProvider provider,
                                           List<PublishedService> services,
                                           Optional<PublishedReviewsUseCase.Rating> rating) {
        PublicProviderView view = new PublicProviderView()
                .slug(provider.slug())
                .businessName(provider.businessName())
                .timezone(provider.timezone().getId())
                .services(services.stream()
                        .map(PublicPage::service)
                        .toList());

        // Absent rather than zero. A business nobody has reviewed has no
        // opinion attached to it, and nought out of five is an opinion.
        rating.map(PublicPage::summary).ifPresent(view::setRating);

        provider.description().ifPresent(view::setDescription);
        provider.categorySlug().ifPresent(view::setCategorySlug);
        provider.city().ifPresent(view::setCity);
        provider.addressLine().ifPresent(view::setAddressLine);
        provider.locality().ifPresent(l -> view.setLocality(
                new LocalityRef()
                        .slug(l.slug()).labelFr(l.labelFr())));
        provider.area().ifPresent(view::setArea);
        provider.logoUrl().ifPresent(name -> view.setLogoUrl(MEDIA + name));
        provider.coverUrl().ifPresent(name -> view.setCoverUrl(MEDIA + name));
        provider.publicPhoneE164().ifPresent(view::setPublicPhoneE164);
        provider.whatsappPhoneE164().ifPresent(view::setWhatsappPhoneE164);
        return view;
    }

    static PublicServiceOffering service(PublishedService published) {
        PublicServiceOffering service = new PublicServiceOffering()
                .serviceOfferingId(published.id().value())
                .name(published.name())
                .durationMinutes((int) published.duration().toMinutes())
                // Exactly what the booking form must put to the customer: one
                // value asks nothing, several ask, and the answer comes back on
                // the booking request.
                .fulfilments(published.fulfilments().stream()
                        .map(PublicPage::wire).toList())
                // Deprecated and still required. A client that branches on it
                // draws one of the ways this service can be had and hides the
                // others, which is why the array above exists.
                .fulfilment(wire(published.primaryFulfilment()))
                .photos(published.photos().stream().map(name -> MEDIA + name).toList());

        // "Ready in 48 h" is what a customer needs before choosing. Without it
        // a drop-off reads as a ten-minute service, because ten minutes is what
        // the handover takes.
        published.turnaround().ifPresent(t -> service.setTurnaroundHours((int) t.toHours()));
        published.description().ifPresent(service::setDescription);
        // Absent, not zero: a hidden price rendered as 0 reads as free.
        published.price().ifPresent(price -> service.setPrice(new Money()
                .amountMinor(price.amountMinor())
                .currency(price.currency().name())));
        return service;
    }

    private static PublicOpeningHoursSegment segment(OpenWindow window) {
        return new PublicOpeningHoursSegment()
                .dayOfWeek(window.dayOfWeek())
                .startTime(window.start().toString())
                .endTime(window.end().toString());
    }

    /**
     * The people a customer may book with, and their names only.
     *
     * <p>Deliberately not everybody on the team: this list is what the booking
     * form offers, and somebody who is not bookable is not an offer.
     */
    static PublicStaffList staff(List<BookableStaff> bookable) {
        return new PublicStaffList()
                .data(bookable.stream()
                        .map(m -> new PublicStaffMember()
                                .staffId(m.id().value())
                                .displayName(m.displayName()))
                        .toList());
    }

    /** The week, in the provider's own zone, which is the only one it means. */
    static PublicOpeningHours hours(String timezone, List<OpenWindow> week) {
        return new PublicOpeningHours()
                .timezone(timezone)
                .data(week.stream().map(PublicPage::segment).toList());
    }

    static ReviewSummary summary(PublishedReviewsUseCase.Rating rating) {
        return new ReviewSummary().average(rating.average()).count(rating.count());
    }

    static Fulfilment wire(com.balaaca.catalog.ports.inbound.Fulfilment mode) {
        return Fulfilment.valueOf(mode.name());
    }
}
