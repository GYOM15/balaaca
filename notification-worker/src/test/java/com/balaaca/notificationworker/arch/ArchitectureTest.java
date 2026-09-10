package com.balaaca.notificationworker.arch;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

import com.tngtech.archunit.core.importer.ImportOption;
import java.util.random.RandomGenerator;

import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;

/**
 * The satellite's own boundary, which is a single sentence: it depends on
 * nothing of ours.
 *
 * <p>That is not tidiness. A notification row is a self-contained snapshot
 * precisely because the worker's database role can read that one table and no
 * other, so there is nothing for it to import - and the day someone adds
 * booking as a dependency "just to reuse a record", the row stops being a
 * snapshot and the least-privilege role stops being enough.
 *
 * <p>The compiler will not catch it: adding the artifact to the pom makes the
 * import legal. This will.
 */
@AnalyzeClasses(packages = "com.balaaca",
                importOptions = ImportOption.DoNotIncludeTests.class)
class ArchitectureTest {

    @ArchTest
    static final ArchRule the_worker_imports_nothing_of_the_core =
            noClasses().should().dependOnClassesThat()
                    .resideInAnyPackage("com.balaaca.sharedkernel..",
                                        "com.balaaca.platformkernel..",
                                        "com.balaaca.identity..", "com.balaaca.providers..",
                                        "com.balaaca.catalog..", "com.balaaca.scheduling..",
                                        "com.balaaca.booking..", "com.balaaca.billing..",
                                        "com.balaaca.app..")
                    .because("the row carries everything a send needs; a worker that "
                             + "imports a domain type is a worker that will soon want "
                             + "to read the table behind it, which its role forbids");

    @ArchTest
    static final ArchRule everything_lives_under_one_package =
            classes().that().resideInAPackage("com.balaaca..")
                    .should().resideInAPackage("com.balaaca.notificationworker..")
                    .because("this deployable is one thing; a second top-level "
                             + "package here is a second thing nobody decided to build");

    @ArchTest
    static final ArchRule the_drain_never_binds_a_tenant =
            noClasses().should().dependOnClassesThat()
                    .haveSimpleNameContaining("TenantContext")
                    .because("TenantContext is request-scoped and a scheduled drain "
                             + "has no request; the worker's own RLS policy admits "
                             + "the rows and it resolves nothing");

    /**
     * Nothing here asks the runtime to go and find an implementation for it.
     *
     * <p>`RandomGenerator.getDefault()` names an algorithm and resolves it
     * through ServiceLoader. That lookup succeeds under `@QuarkusTest`, where
     * the application sits on the system classpath, and fails in the PACKAGED
     * application, which is what actually ships. On the Raspberry Pi it threw
     * `IllegalArgumentException: No implementation of the random number
     * generator algorithm "L32X64MixRandom" is available` from a bean
     * constructor, every five seconds for thirteen hours, while the container
     * reported healthy and not one notification was ever sent.
     *
     * <p>Every test in this project passed throughout. The gap is that nothing
     * here boots the packaged artefact, so a rule that reads the source is the
     * honest guard: it is narrow, it names exactly the API that did this, and
     * it costs nothing.
     */
    @ArchTest
    static final ArchRule nothing_resolves_a_generator_at_runtime =
            noClasses().should().callMethod(RandomGenerator.class, "getDefault")
                    .orShould().dependOnClassesThat()
                    .haveFullyQualifiedName("java.util.random.RandomGeneratorFactory")
                    .because("both resolve an algorithm through ServiceLoader, which "
                             + "finds it under @QuarkusTest and not in the packaged "
                             + "application - a bean constructor that threw every five "
                             + "seconds for thirteen hours on the Pi behind a green "
                             + "healthcheck. java.util.Random needs no lookup. The "
                             + "RandomGenerator INTERFACE is deliberately still allowed: "
                             + "Backoff takes it so a test can hand it a fixed one");

    @ArchTest
    static final ArchRule persistence_stays_plain_jdbc =
            noClasses().should().dependOnClassesThat()
                    .resideInAnyPackage("jakarta.persistence..", "org.hibernate..")
                    .because("one table read through four statements gains nothing "
                             + "from a persistence unit it would then have to be "
                             + "configured not to let manage a schema it does not own");
}
