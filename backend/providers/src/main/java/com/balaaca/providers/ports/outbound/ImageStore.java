package com.balaaca.providers.ports.outbound;

import java.util.Optional;

/**
 * Where a published image lives, and what makes it safe to publish.
 *
 * <p>A port rather than a call to a filesystem, for the reason the payment
 * abstraction exists: the filesystem is what this deployment has today, an
 * object store is what it will have, and the difference should be one adapter
 * rather than a search through the codebase.
 *
 * <p>It takes RAW bytes. Deciding whether they are an image at all means
 * decoding one, and decoding is the adapter's business - a domain that knows how
 * to read a PNG changes when a decoder does.
 */
public interface ImageStore {

    /**
     * @return the name to publish. Minted by the store, meaningless by design -
     *         not the provider, not the kind, not the original filename - so a
     *         URL discloses nothing and cannot be walked
     * @throws com.balaaca.providers.domain.ImageRejectedException not an image
     *         this platform will publish
     */
    String store(byte[] raw);

    /** Best effort. A file that outlives its row costs disk, not correctness. */
    void discard(String name);

    /** What content type a stored name carries, for the caller's audit line. */
    Optional<String> contentTypeOf(String name);
}
