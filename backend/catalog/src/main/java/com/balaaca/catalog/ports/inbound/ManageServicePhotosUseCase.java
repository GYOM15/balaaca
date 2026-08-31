package com.balaaca.catalog.ports.inbound;

import com.balaaca.sharedkernel.ids.ServiceOfferingId;
import java.util.List;
import java.util.UUID;

/**
 * What a service looks like.
 *
 * <p>A customer choosing between "Tresses collees - 150 000" and "Tresses
 * torsades - 200 000" cannot tell the difference from the words. In braiding,
 * in nails, in decoration, in catering, the photograph IS the specification:
 * it is what is being bought, and the text is a label on it.
 *
 * <p>They hang off the SERVICE and not off the provider on purpose. A gallery
 * on the business answers "is this place any good", which a photograph of the
 * work answers too and better, because it is attached to something bookable.
 * And it is not a choice between two features: with photographs on each
 * service, the provider's gallery is their union - it comes for free, and every
 * picture in it leads to a price and a button.
 */
public interface ManageServicePhotosUseCase {

    List<Photo> of(ServiceOfferingId serviceOfferingId);

    /**
     * Adds one, in the next free slot.
     *
     * @throws com.balaaca.catalog.domain.TooManyPhotosException when all five
     *         are taken. The cap is about the PAGE, not about storage: a
     *         catalogue of twelve services with no limit is a page that never
     *         finishes loading on a mid-range telephone, which costs the
     *         provider every customer who closes it
     * @throws com.balaaca.catalog.domain.ServiceOfferingNotFoundException
     */
    List<Photo> add(ServiceOfferingId serviceOfferingId, byte[] image);

    /** @throws com.balaaca.catalog.domain.PhotoNotFoundException unknown, or not the caller's */
    List<Photo> remove(ServiceOfferingId serviceOfferingId, UUID photoId);

    /** @param name what the store minted. It discloses neither the provider nor the file */
    record Photo(UUID id, String name, int position) {
    }
}
