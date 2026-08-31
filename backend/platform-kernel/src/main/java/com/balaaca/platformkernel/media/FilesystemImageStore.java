package com.balaaca.platformkernel.media;

import jakarta.enterprise.context.ApplicationScoped;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import io.quarkus.runtime.StartupEvent;
import jakarta.enterprise.event.Observes;
import java.nio.file.Path;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.Optional;
import java.util.regex.Pattern;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

/**
 * Images on a mounted directory.
 *
 * <p>Honest rather than ideal, and worth saying which. One application instance
 * serving its own bytes does not survive a second instance, and images belong
 * behind a CDN. That is exactly why {@link ImageStore} is a port: the day this
 * moves to an object store, this class is what changes.
 *
 * <p>The file name is minted here and is 128 bits of nothing: no provider, no
 * kind, no original filename. A name a caller supplied would be a path a caller
 * chose, and the only safe answer to that is not to use it.
 */
@ApplicationScoped
public class FilesystemImageStore implements ImageStore {

    private static final Logger LOG = Logger.getLogger(FilesystemImageStore.class);

    /** Mirrors the contract's own pattern, so nothing else can reach the disk. */
    private static final Pattern SAFE_NAME = Pattern.compile("^[A-Za-z0-9_-]{16,64}\\.(jpg|png)$");

    private static final SecureRandom RANDOM = new SecureRandom();

    private final Path root;

    public FilesystemImageStore(@ConfigProperty(name = "balaaca.media.root") String root) {
        this.root = Path.of(root).toAbsolutePath().normalize();
    }

    /**
     * Refuses to start when the media root cannot be written.
     *
     * <p>At startup, and not at the first upload, which is where it used to
     * surface: the default root is /var/lib/balaaca/media, an operator creates
     * it or does not, and if they do not, the application boots green, serves
     * every other request, and answers the first provider who sends a logo with
     * "500 Unexpected error". They have no way to read that as a directory
     * permission, and the operator has no reason to look.
     *
     * <p>The same reasoning as the notification worker's absent channel: an
     * application that cannot do a thing should say so while somebody is still
     * watching the logs, not the first time a customer needs it.
     *
     * <p>It probes by writing, because a permission bit is not the question -
     * the question is whether this process can put a file there. A read-only
     * mount, a full disk and a wrong owner all answer it the same way.
     */
    void verifyWritable(@Observes StartupEvent event) {
        try {
            Files.createDirectories(root);
            Path probe = Files.createTempFile(root, ".probe-", ".tmp");
            Files.delete(probe);
            LOG.infof("media.root_ready path=%s", root);
        } catch (IOException e) {
            throw new IllegalStateException(
                    "balaaca.media.root is not writable: " + root
                            + ". Create it and give this process write access, or point"
                            + " BALAACA_MEDIA_ROOT somewhere it has. Refusing to start:"
                            + " every logo and cover upload would answer 500.", e);
        }
    }

    @Override
    public String store(byte[] content) {
        SanitisedImage image = SanitisedImage.of(content);
        byte[] raw = new byte[16];
        RANDOM.nextBytes(raw);
        String name = Base64.getUrlEncoder().withoutPadding().encodeToString(raw)
                + "." + image.extension();
        try {
            // No createDirectories here any more: verifyWritable made the root
            // at startup, and re-making it on every write would quietly paper
            // over a root that disappeared underneath us.
            Files.write(root.resolve(name), image.content());
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        return name;
    }

    @Override
    public void discard(String name) {
        resolve(name).ifPresent(path -> {
            try {
                Files.deleteIfExists(path);
            } catch (IOException e) {
                // The row already points elsewhere. A leftover file costs disk,
                // and failing the request over it would refuse a change that
                // has already happened.
                LOG.warnf("media.discard_failed name=%s", name);
            }
        });
    }

    @Override
    public Optional<String> contentTypeOf(String name) {
        return resolve(name).filter(Files::isRegularFile).map(FilesystemImageStore::typeOf);
    }

    @Override
    public Optional<ImageStore.PublishedImage> image(String name) {
        return resolve(name).filter(Files::isRegularFile).map(path -> {
            try {
                return new ImageStore.PublishedImage(Files.readAllBytes(path), typeOf(path));
            } catch (IOException e) {
                throw new UncheckedIOException(e);
            }
        });
    }

    private static String typeOf(Path path) {
        return path.getFileName().toString().endsWith(".png") ? "image/png" : "image/jpeg";
    }


    /**
     * Two guards, and the second is the one that matters. The pattern refuses a
     * name carrying a separator or a dot segment; normalising and re-checking
     * the parent refuses anything the pattern did not anticipate. A path
     * traversal that gets past a regex does not get past "is it still in the
     * directory I meant".
     */
    private Optional<Path> resolve(String name) {
        if (name == null || !SAFE_NAME.matcher(name).matches()) {
            return Optional.empty();
        }
        Path path = root.resolve(name).normalize();
        return path.getParent() != null && path.getParent().equals(root)
                ? Optional.of(path)
                : Optional.empty();
    }
}
