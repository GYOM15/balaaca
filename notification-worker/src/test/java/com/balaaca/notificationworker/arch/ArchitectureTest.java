package com.balaaca.notificationworker.arch;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

import com.tngtech.archunit.core.importer.ImportOption;
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

    @ArchTest
    static final ArchRule persistence_stays_plain_jdbc =
            noClasses().should().dependOnClassesThat()
                    .resideInAnyPackage("jakarta.persistence..", "org.hibernate..")
                    .because("one table read through four statements gains nothing "
                             + "from a persistence unit it would then have to be "
                             + "configured not to let manage a schema it does not own");
}
