/**
 * Subscriptions and plan entitlements - quotas, never payment collection.
 *
 * <p>Empty until the first quota is enforced. ADR-0005 draws the line: the
 * platform never holds funds, so there is no PSP here and no invoicing, and
 * what will live here is the entitlement check a use case asks before it lets
 * a provider exceed their plan.
 *
 * <p>See {@code com.balaaca.identity} for why an empty module still carries a
 * package-info.
 */
package com.balaaca.billing;
