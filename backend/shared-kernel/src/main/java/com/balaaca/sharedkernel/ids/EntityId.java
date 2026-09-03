package com.balaaca.sharedkernel.ids;

import java.util.UUID;

/**
 * Contract shared by every identifier. Implemented by records rather than
 * extended, so each id is a distinct type the compiler can tell apart: passing
 * a customer id where a staff id belongs stops being a runtime mystery and
 * becomes a compile error.
 */
public interface EntityId {

    UUID value();
}
