package com.balaaca.app.rest;

import com.balaaca.app.api.ModerationApi;
import com.balaaca.app.api.model.ContestationPage;
import com.balaaca.app.api.model.ContestationQueueView;
import com.balaaca.app.api.model.LocalityRef;
import com.balaaca.app.api.model.ModeratedProviderPage;
import com.balaaca.app.api.model.ModeratedProviderView;
import com.balaaca.app.api.model.ModerationView;
import com.balaaca.app.api.model.ProviderReportPage;
import com.balaaca.app.api.model.ProviderReportView;
import com.balaaca.app.api.model.ProviderStatus;
import com.balaaca.app.api.model.ReportReason;
import com.balaaca.app.api.model.SuspensionRequest;
import com.balaaca.providers.ports.inbound.ModerateProvidersUseCase;
import com.balaaca.providers.ports.inbound.ModerateProvidersUseCase.ModeratedProvider;
import com.balaaca.providers.ports.inbound.ModerateProvidersUseCase.Moderation;
import com.balaaca.providers.ports.inbound.ModerateProvidersUseCase.Report;
import io.quarkus.security.Authenticated;
import jakarta.annotation.security.RolesAllowed;
import jakarta.ws.rs.core.Response;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;

/**
 * The platform's own surface.
 *
 * <p>{@code @Authenticated} but deliberately NOT {@code @TenantBound}. Every
 * other authenticated route in this application resolves a provider from the
 * caller's membership before it runs, and that is exactly what must not happen
 * here: the operator has no salon, so binding a tenant would refuse every call,
 * and the operations act on a business that is by definition not theirs.
 *
 * <p>What replaces the tenant as the guard is the scope, and the fact that the
 * writes are unreachable without it: {@code balaaca_app} cannot UPDATE another
 * provider's row at all, and the two SECURITY DEFINER functions behind these
 * methods are owned by a NOLOGIN role that exists for nothing else.
 */
@Authenticated
public class ModerationResource implements ModerationApi {

    private final ModerateProvidersUseCase moderation;

    public ModerationResource(ModerateProvidersUseCase moderation) {
        this.moderation = moderation;
    }

    @Override
    @RolesAllowed("admin:moderation")
    public Response listAllProviders(String q, ProviderStatus status, String cursor,
                                     Integer limit) {
        var page = moderation.providers(
                Optional.ofNullable(q).filter(v -> !v.isBlank()),
                Optional.ofNullable(status).map(ProviderStatus::toString),
                Cursors.directoryPosition(cursor),
                limit == null ? Cursors.DEFAULT_LIMIT : limit);

        return Response.ok(new ModeratedProviderPage()
                .data(page.entries().stream().map(ModerationResource::view).toList())
                .nextCursor(page.next().map(Cursors::encodeDirectory).orElse(null)))
                // Never cached, for the same reason the queues are not: this is
                // every business on the platform with its standing beside it,
                // and an intermediary holding a copy of it is a leak with no
                // upside.
                .header("Cache-Control", PublicCaching.NEVER)
                .build();
    }

    @Override
    @RolesAllowed("admin:moderation")
    public Response suspendProvider(String slug, SuspensionRequest request) {
        return Response.ok(view(moderation.suspend(slug, request.getReason()))).build();
    }

    @Override
    @RolesAllowed("admin:moderation")
    public Response reinstateProvider(String slug) {
        return Response.ok(view(moderation.reinstate(slug))).build();
    }

    @Override
    @RolesAllowed("admin:moderation")
    public Response listProviderReports(String status, String cursor, Integer limit) {
        var page = moderation.reports(
                Optional.ofNullable(status).filter(v -> !v.isBlank()),
                Cursors.rawId(cursor),
                limit == null ? Cursors.DEFAULT_LIMIT : limit);

        return Response.ok(new ProviderReportPage()
                .data(page.entries().stream().map(ModerationResource::view).toList())
                .nextCursor(page.next().map(Cursors::encodeRawId).orElse(null)))
                // Never cached, anywhere. This is a list of complaints naming
                // named businesses; an intermediary holding a copy of it is a
                // leak with no upside.
                .header("Cache-Control", PublicCaching.NEVER)
                .build();
    }

    @Override
    @RolesAllowed("admin:moderation")
    public Response reviewProviderReport(UUID id) {
        return Response.ok(view(moderation.review(id)))
                .header("Cache-Control", PublicCaching.NEVER)
                .build();
    }

    private static ModerationView view(Moderation m) {
        ModerationView view = new ModerationView()
                .slug(m.slug())
                .status(ProviderStatus.fromValue(m.status()));

        m.suspendedAt().ifPresent(at ->
                view.setSuspendedAt(OffsetDateTime.ofInstant(at, ZoneOffset.UTC)));
        m.reason().ifPresent(view::setSuspensionReason);
        return view;
    }

    private static ModeratedProviderView view(ModeratedProvider p) {
        ModeratedProviderView view = new ModeratedProviderView()
                .slug(p.slug())
                .businessName(p.businessName())
                .published(p.published())
                .status(ProviderStatus.fromValue(p.status()))
                .registeredAt(OffsetDateTime.ofInstant(p.registeredAt(), ZoneOffset.UTC))
                .appointmentCount(p.appointmentCount());

        p.trade().ifPresent(view::setTrade);
        p.area().ifPresent(view::setArea);
        p.suspensionReason().ifPresent(view::setSuspensionReason);
        // Both halves or neither: a reference carrying a slug the caller cannot
        // display, or a label it cannot pass back to listProviders, is half a
        // place. The column is nullable and the join is a LEFT one, so this is
        // the ordinary case for a business that has never been placed.
        p.localitySlug().flatMap(slug -> p.localityLabel().map(
                label -> new LocalityRef().slug(slug).labelFr(label)))
                .ifPresent(view::setLocality);
        return view;
    }

    private static ProviderReportView view(Report r) {
        ProviderReportView view = new ProviderReportView()
                .reportId(r.id())
                .providerSlug(r.providerSlug())
                .providerName(r.providerName())
                .providerStatus(ProviderStatus.fromValue(r.providerStatus()))
                .reason(ReportReason.fromValue(r.reason()))
                .status(ProviderReportView.StatusEnum.fromString(r.status()))
                .reportedAt(OffsetDateTime.ofInstant(r.reportedAt(), ZoneOffset.UTC))
                .appointmentStartsAt(
                        OffsetDateTime.ofInstant(r.appointmentStartsAt(), ZoneOffset.UTC))
                .serviceName(r.serviceName());

        r.details().ifPresent(view::setDetails);
        r.reviewedAt().ifPresent(at ->
                view.setReviewedAt(OffsetDateTime.ofInstant(at, ZoneOffset.UTC)));
        return view;
    }
    @Override
    @RolesAllowed("admin:moderation")
    public Response listContestations(String status, String cursor, Integer limit) {
        var page = moderation.contestations(
                Optional.ofNullable(status).filter(v -> !v.isBlank()),
                Cursors.rawId(cursor),
                limit == null ? Cursors.DEFAULT_LIMIT : limit);

        return Response.ok(new ContestationPage()
                .data(page.entries().stream().map(ModerationResource::view).toList())
                .nextCursor(page.next().map(Cursors::encodeRawId).orElse(null)))
                .header("Cache-Control", PublicCaching.NEVER)
                .build();
    }

    @Override
    @RolesAllowed("admin:moderation")
    public Response readContestation(UUID id) {
        return Response.ok(view(moderation.read(id)))
                .header("Cache-Control", PublicCaching.NEVER)
                .build();
    }

    private static ContestationQueueView view(ModerateProvidersUseCase.ContestationView c) {
        ContestationQueueView view = new ContestationQueueView()
                .contestationId(c.id())
                .providerSlug(c.providerSlug())
                .providerName(c.providerName())
                .providerStatus(ProviderStatus.fromValue(c.providerStatus()))
                .message(c.message())
                .aboutSuspensionAt(
                        OffsetDateTime.ofInstant(c.aboutSuspensionAt(), ZoneOffset.UTC))
                .status(ContestationQueueView.StatusEnum.fromString(c.status()))
                .submittedAt(OffsetDateTime.ofInstant(c.submittedAt(), ZoneOffset.UTC));

        c.readAt().ifPresent(at ->
                view.setReadAt(OffsetDateTime.ofInstant(at, ZoneOffset.UTC)));
        c.currentReason().ifPresent(view::setCurrentReason);
        return view;
    }

}
