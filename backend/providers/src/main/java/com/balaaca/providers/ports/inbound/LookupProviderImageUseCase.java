package com.balaaca.providers.ports.inbound;

import java.util.Optional;

/**
 * The bytes behind a published image URL.
 *
 * <p>An inbound port rather than the store itself, so the edge names a
 * published type and never {@code ProviderImage} - which carries the validation
 * rules and is this context's own business.
 */
public interface LookupProviderImageUseCase {

    /** Empty when the name matches nothing, which is the edge's 404. */
    Optional<PublishedImage> image(String name);

    record PublishedImage(byte[] content, String contentType) {

        public PublishedImage {
            content = content.clone();
        }

        @Override
        public byte[] content() {
            return content.clone();
        }
    }
}
