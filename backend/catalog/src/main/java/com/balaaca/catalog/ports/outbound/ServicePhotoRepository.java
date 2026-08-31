package com.balaaca.catalog.ports.outbound;

import com.balaaca.catalog.ports.inbound.ManageServicePhotosUseCase.Photo;
import com.balaaca.sharedkernel.ids.ServiceOfferingId;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** The photographs on one service, in the provider's own order. */
public interface ServicePhotoRepository {

    List<Photo> of(ServiceOfferingId serviceOfferingId);

    boolean offeringExists(ServiceOfferingId serviceOfferingId);

    /** @return empty when all five slots are taken */
    Optional<Photo> add(ServiceOfferingId serviceOfferingId, String storedName);

    /** @return the name the row held, so the caller can drop the file. Empty when unknown */
    Optional<String> remove(ServiceOfferingId serviceOfferingId, UUID photoId);
}
