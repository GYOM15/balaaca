package com.balaaca.app.arch;

import static com.tngtech.archunit.base.DescribedPredicate.not;
import static com.tngtech.archunit.core.domain.JavaClass.Predicates.resideInAPackage;
import static com.tngtech.archunit.core.domain.properties.HasName.Predicates.nameMatching;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noFields;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noMethods;
import static com.tngtech.archunit.library.GeneralCodingRules.NO_CLASSES_SHOULD_ACCESS_STANDARD_STREAMS;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;

/**
 * The boundaries the compiler cannot hold.
 *
 * <p>One Maven module per context puts every context's {@code domain},
 * {@code application} and {@code adapters} on the same classpath, and Maven has
 * no way to publish a subset of packages. Splitting each context into api and
 * impl modules to buy compiler enforcement doubles the module count and still
 * fails the moment someone adds the impl module as a dependency. So the
 * boundary lives here, and nowhere else holds it.
 *
 * <p>These rules are not aspirational: every one of them passed the day it was
 * written. A rule added red is a rule someone deletes.
 *
 * <p>Not an {@code *IT}: it reads bytecode and needs no database, so it runs
 * under Surefire in seconds rather than behind a container.
 *
 * <p>The satellite is absent by construction - it is a separate Maven project
 * and none of its classes are on this classpath. Its own rule lives with it, and
 * asserts the stronger thing: that it depends on no Balaaca artifact at all.
 */
@AnalyzeClasses(packages = "com.balaaca",
                importOptions = ImportOption.DoNotIncludeTests.class)
class ArchitectureTest {

    /** The bounded contexts. Not the kernels, and not the deployable's own wiring. */
    private static final String[] CONTEXTS = {
        "identity", "providers", "catalog", "scheduling", "booking", "billing"
    };

    /**
     * The domain types a port's own records carry. The published surface of a
     * use case is its port, its commands and results, and the types those hold -
     * so the deployable that builds a command or reads a result necessarily
     * touches these, and nothing else in anyone's domain.
     *
     * <p>The list grows one deliberate entry at a time, which is the point: this
     * rule failed the day the agenda started returning AppointmentStatus, and
     * adding it here was a decision someone made rather than a boundary that
     * moved on its own.
     */
    // Every entry here was added on purpose, one at a time, because a port
    // record started carrying it. The list is meant to grow slowly and to be
    // argued about; a wildcard would end the argument by conceding it.
    private static final String PUBLISHED_DOMAIN_TYPES =
            "com\\.balaaca\\.(booking\\.domain\\.(BookingSource|CustomerContact"
            + "|AppointmentStatus)"
            // AvailabilityOverride$Kind: the Closure command carries it, since
            // the day the third kind arrived. Two kinds could be inferred from
            // whether a window was present; three cannot - TIME_OFF carries one
            // exactly as CUSTOM_HOURS does and means the opposite - so the edge
            // has to name the enum rather than guess it.
            + "|scheduling\\.domain\\.(AvailableSlot|OpenWindow"
            + "|AvailabilityOverride(\\$Kind)?)"
            + "|providers\\.domain\\.ProviderStatus)";

    // --- The domain is an island ------------------------------------------

    @ArchTest
    static final ArchRule domain_imports_no_framework =
            noClasses().that().resideInAPackage("..domain..")
                    .should().dependOnClassesThat().resideInAnyPackage(
                            "jakarta..", "io.quarkus..", "org.hibernate..", "io.agroal..",
                            "org.eclipse.microprofile..", "com.balaaca.platformkernel..")
                    .because("a domain rule that needs a container to run is a rule "
                             + "nobody unit-tests, and platform-kernel drags CDI, JWT "
                             + "and Agroal behind everything that imports it");

    /**
     * Written as a loop rather than with a {@code (*)} back-reference: the
     * capture group is substituted by {@code resideInAPackage} and taken
     * literally by {@code resideInAnyPackage}, so the elegant form silently
     * compares every domain class against a package named {@code $1} and
     * reports every dependency it has, including its own.
     */
    @ArchTest
    static void a_domain_depends_only_on_itself_and_the_shared_kernel(JavaClasses classes) {
        for (String context : CONTEXTS) {
            classes().that().resideInAPackage("com.balaaca." + context + ".domain..")
                    .should().onlyDependOnClassesThat().resideInAnyPackage(
                            "com.balaaca." + context + ".domain..",
                            "com.balaaca.sharedkernel..", "java..")
                    .allowEmptyShould(true)
                    .because("a domain type whose field or factory mentions another "
                             + "context makes every reshape over there ripple in here; "
                             + "two contexts meet in application/, which is the layer "
                             + "allowed to know about both")
                    .check(classes);
        }
    }

    @ArchTest
    static final ArchRule the_domain_never_reads_the_clock =
            noClasses().that().resideInAPackage("..domain..")
                    .should().callMethod(Instant.class, "now")
                    .orShould().callMethod(LocalDate.class, "now")
                    .orShould().callMethod(ZoneId.class, "systemDefault")
                    .because("a calculation that reads the system clock cannot be "
                             + "tested at a boundary; the instant is passed in");

    // --- Layers point inward ----------------------------------------------

    @ArchTest
    static final ArchRule nothing_inward_depends_on_an_adapter =
            noClasses().that().resideInAnyPackage("..domain..", "..ports..", "..application..")
                    .should().dependOnClassesThat().resideInAPackage("..adapters..")
                    .because("an adapter is one implementation of a port, and the "
                             + "inside naming it is the dependency inverted");

    @ArchTest
    static final ArchRule the_domain_and_its_ports_ignore_the_application_layer =
            noClasses().that().resideInAnyPackage("..domain..", "..ports..")
                    .should().dependOnClassesThat().resideInAPackage("..application..")
                    .because("orchestration knows about rules; rules must not know "
                             + "which orchestration invoked them");

    // --- One context never reaches into another ---------------------------

    @ArchTest
    static void a_context_touches_only_another_context_s_ports(JavaClasses classes) {
        for (String context : CONTEXTS) {
            for (String other : CONTEXTS) {
                if (context.equals(other)) {
                    continue;
                }
                noClasses().that().resideInAPackage("com.balaaca." + context + "..")
                        .should().dependOnClassesThat().resideInAnyPackage(
                                "com.balaaca." + other + ".domain..",
                                "com.balaaca." + other + ".application..",
                                "com.balaaca." + other + ".adapters..")
                        .allowEmptyShould(true)
                        .because(context + " may call " + other + " only through its "
                                 + "published inbound port; the classpath allows the "
                                 + "rest and nothing else forbids it")
                        .check(classes);
            }
        }
    }

    @ArchTest
    static final ArchRule the_wiring_touches_only_what_a_context_publishes =
            noClasses().that().resideInAPackage("com.balaaca.app..")
                    .should().dependOnClassesThat(
                            resideInAPackage("com.balaaca.*.application..")
                                    .or(resideInAPackage("com.balaaca.*.adapters..")))
                    .because("the deployable wires ports together; reaching past one "
                             + "into a service or an adapter pins the wiring to an "
                             + "implementation the port exists to hide");

    @ArchTest
    static final ArchRule the_wiring_touches_only_published_domain_types =
            noClasses().that().resideInAPackage("com.balaaca.app..")
                    .should().dependOnClassesThat(
                            resideInAPackage("com.balaaca.*.domain..")
                                    .and(not(nameMatching(PUBLISHED_DOMAIN_TYPES))))
                    .because("an inbound command or view carries these, so the edge that "
                             + "builds one has to name them; anything else in a "
                             + "domain is that context's own business");

    // --- The deployable list is closed ------------------------------------

    @ArchTest
    static final ArchRule every_package_is_a_declared_module =
            classes().that().resideInAPackage("com.balaaca..")
                    .should().resideInAnyPackage(
                            "com.balaaca.sharedkernel..", "com.balaaca.platformkernel..",
                            "com.balaaca.identity..", "com.balaaca.providers..",
                            "com.balaaca.catalog..", "com.balaaca.scheduling..",
                            "com.balaaca.booking..", "com.balaaca.billing..",
                            "com.balaaca.app..")
                    .because("a new top-level package is a new bounded context, which "
                             + "is a decision with an ADR behind it and not something "
                             + "that appears because a class needed somewhere to live");

    // --- What this architecture refuses to own ----------------------------

    @ArchTest
    static final ArchRule there_is_no_broker_and_no_grpc =
            noClasses().should().dependOnClassesThat().resideInAnyPackage(
                            "io.grpc..", "com.google.protobuf..",
                            "org.apache.kafka..", "io.vertx.kafka..")
                    .because("core to core is an in-process port call and core to "
                             + "satellite is a row in the notifications table; a "
                             + "broker is deferred until volume forces one (ADR-0004)");

    @ArchTest
    static void a_core_context_makes_no_network_call(JavaClasses classes) {
        for (String context : CONTEXTS) {
            noClasses().that().resideInAPackage("com.balaaca." + context + "..")
                    .should().dependOnClassesThat().resideInAnyPackage(
                            "java.net.http..", "org.eclipse.microprofile.rest.client..",
                            "io.vertx.ext.web.client..")
                    .allowEmptyShould(true)
                    .because("a network hop between two contexts of the same monolith "
                             + "buys latency and a failure mode, and costs the "
                             + "transaction that held them together")
                    .check(classes);
        }
    }

    /**
     * Fields and return types, not every mention. {@code atTime(...).atZone(...)}
     * produces a LocalDateTime and consumes it one call later, which is how a
     * local opening hour becomes an instant correctly. What ADR-0007 forbids is
     * one that is stored or handed on - the point where the zone is gone and
     * nobody can say which instant was meant.
     */
    @ArchTest
    static final ArchRule no_wall_clock_type_is_stored =
            noFields().should().haveRawType(LocalDateTime.class)
                    .because("a local date-time is an instant with its zone thrown "
                             + "away; the schema stores timestamptz and the domain "
                             + "carries Instant (ADR-0007)");

    @ArchTest
    static final ArchRule no_wall_clock_type_is_handed_on =
            noMethods().should().haveRawReturnType(LocalDateTime.class)
                    .because("returning one moves the ambiguity to the caller, which "
                             + "is where it becomes someone else's bug (ADR-0007)");

    // --- House rules cheap enough to encode -------------------------------

    @ArchTest
    static final ArchRule collaborators_arrive_through_the_constructor =
            noFields().should().beAnnotatedWith("jakarta.inject.Inject")
                    .because("a field-injected bean cannot be constructed in a unit "
                             + "test, and its dependencies are invisible in its "
                             + "signature");

    @ArchTest
    static final ArchRule no_type_is_named_for_being_an_implementation =
            noClasses().should().haveSimpleNameEndingWith("Impl")
                    .because("Impl carries no information and blocks the second "
                             + "implementation from having a meaningful name");

    @ArchTest
    static final ArchRule nothing_writes_to_a_standard_stream =
            NO_CLASSES_SHOULD_ACCESS_STANDARD_STREAMS
                    .because("the log is structured and masked at its boundary; "
                             + "System.out bypasses both");
}
