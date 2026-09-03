package com.balaaca.catalog.application;

import com.balaaca.catalog.domain.PhotoNotFoundException;
import com.balaaca.catalog.domain.ServiceOfferingNotFoundException;
import com.balaaca.catalog.domain.TooManyPhotosException;
import com.balaaca.catalog.ports.inbound.ManageServicePhotosUseCase;
import com.balaaca.catalog.ports.outbound.ServicePhotoRepository;
import com.balaaca.platformkernel.media.ImageStore;
import com.balaaca.sharedkernel.ids.ServiceOfferingId;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import java.util.List;
import java.util.UUID;

/** What a service looks like, added and removed. */
@ApplicationScoped
public class ManageServicePhotosService implements ManageServicePhotosUseCase {

    private final ServicePhotoRepository photos;
    private final ImageStore images;

    public ManageServicePhotosService(ServicePhotoRepository photos, ImageStore images) {
        this.photos = photos;
        this.images = images;
    }

    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    public List<Photo> of(ServiceOfferingId serviceOfferingId) {
        requireOffering(serviceOfferingId);
        return photos.of(serviceOfferingId);
    }

    /**
     * Validate, store, then point a row at it - in that order.
     *
     * <p>The same order the logo takes and for the same reason: the file is
     * written before the row names it, so a failure leaves an orphan on disk
     * rather than a page pointing at nothing. Wasted bytes are cheap and a
     * broken page is not.
     */
    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    public List<Photo> add(ServiceOfferingId serviceOfferingId, byte[] image) {
        requireOffering(serviceOfferingId);

        // FREE, and deliberately: this is a photograph of the work itself, and
        // the platform has no business deciding what to trim out of it.
        String name = images.store(image, ImageStore.Shape.FREE);
        if (photos.add(serviceOfferingId, name).isEmpty()) {
            // Every slot taken. The file is dropped rather than left behind:
            // nothing will ever name it, so it is an orphan by construction and
            // not by accident.
            images.discard(name);
            throw new TooManyPhotosException();
        }
        return photos.of(serviceOfferingId);
    }

    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    public List<Photo> remove(ServiceOfferingId serviceOfferingId, UUID photoId) {
        requireOffering(serviceOfferingId);

        String removed = photos.remove(serviceOfferingId, photoId)
                .orElseThrow(() -> new PhotoNotFoundException(photoId));

        // After the row is gone, so a rollback never deletes a file the page
        // still names.
        images.discard(removed);
        return photos.of(serviceOfferingId);
    }

    private void requireOffering(ServiceOfferingId id) {
        if (!photos.offeringExists(id)) {
            throw new ServiceOfferingNotFoundException(id.value());
        }
    }
}
