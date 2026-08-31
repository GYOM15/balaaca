package com.balaaca.providers.application;

import com.balaaca.providers.ports.inbound.ListLocalitiesUseCase;
import com.balaaca.providers.ports.outbound.LocalityRepository;
import jakarta.enterprise.context.ApplicationScoped;
import java.util.List;
import java.util.Optional;

/** Reference data has no rule of its own: it is read and returned. */
@ApplicationScoped
public class ListLocalitiesService implements ListLocalitiesUseCase {

    private final LocalityRepository localities;

    public ListLocalitiesService(LocalityRepository localities) {
        this.localities = localities;
    }

    @Override
    public List<Locality> all() {
        return localities.all();
    }

    @Override
    public Optional<String> canonicalSlug(String slugOrAlias) {
        return localities.canonicalSlug(slugOrAlias);
    }

    @Override
    public List<Area> areas(Optional<String> contains, Optional<String> within) {
        return localities.areas(contains, within);
    }
}
