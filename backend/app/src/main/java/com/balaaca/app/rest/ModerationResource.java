package com.balaaca.app.rest;

import com.balaaca.app.api.ModerationApi;
import com.balaaca.app.api.model.ModerationView;
import com.balaaca.app.api.model.ProviderReportPage;
import com.balaaca.app.api.model.ProviderReportView;
import com.balaaca.app.api.model.ProviderStatus;
import com.balaaca.app.api.model.ReportReason;
import com.balaaca.app.api.model.SuspensionRequest;
import com.balaaca.providers.ports.inbound.ModerateProvidersUseCase;
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
}
