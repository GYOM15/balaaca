package com.balaaca.notificationworker.it;

import io.quarkus.test.common.QuarkusTestResourceLifecycleManager;
import java.util.Map;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.wait.strategy.Wait;
import org.testcontainers.utility.DockerImageName;

/**
 * A real SMTP server, not a mock.
 *
 * <p>The same image and the same two ports the development stack runs, so what
 * the tests exercise is the protocol rather than a stub of it: the connection,
 * the EHLO, the multipart body and the encoding of an accented word are all
 * things a mocked {@code Mailer} would have agreed to without checking.
 *
 * <p>Mailpit sends nothing anywhere. That is why it can be pointed at without a
 * relay account and without any chance of a test message reaching a person.
 */
public class MailpitTestResource implements QuarkusTestResourceLifecycleManager {

    private static final DockerImageName IMAGE = DockerImageName.parse("axllent/mailpit:v1.21");

    private static final int SMTP = 1025;
    private static final int WEB = 8025;

    /** Where the test reads what was caught. Not a worker setting: a test one. */
    public static final String API_URL = "balaaca.test.mailpit.api-url";

    private GenericContainer<?> mailpit;

    @Override
    public Map<String, String> start() {
        mailpit = new GenericContainer<>(IMAGE)
                .withExposedPorts(SMTP, WEB)
                .withEnv("MP_SMTP_AUTH_ACCEPT_ANY", "true")
                .withEnv("MP_SMTP_AUTH_ALLOW_INSECURE", "true")
                .waitingFor(Wait.forHttp("/readyz").forPort(WEB));
        mailpit.start();

        return Map.of(
                "quarkus.mailer.host", mailpit.getHost(),
                "quarkus.mailer.port", String.valueOf(mailpit.getMappedPort(SMTP)),
                API_URL, "http://" + mailpit.getHost() + ":" + mailpit.getMappedPort(WEB));
    }

    @Override
    public void stop() {
        if (mailpit != null) {
            mailpit.stop();
        }
    }
}
