/**
 * Users and the link between a Keycloak subject and a Balaaca account.
 *
 * <p>Empty until authentication is built. The module is declared already
 * because the layout is a decision, not a consequence: a class that needs a
 * home finds one here rather than inventing a package.
 *
 * <p>The file is not a placeholder for its own sake. Without one, javac emits
 * no {@code target/classes} for this module, and the Quarkus dependency
 * resolver stops on the missing directory - which is why {@code mvn compile}
 * failed on a clean checkout while {@code verify} passed.
 */
package com.balaaca.identity;
