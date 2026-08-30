package com.balaaca.scheduling.domain;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * Turns every bookable person's declared hours into the hours of the business.
 *
 * <p>A salon is open when any of its people is working, and a customer laying a
 * grid over the week does not care which of them. Two barbers who both work
 * Tuesday morning are one open window, not two stacked on top of each other -
 * unmerged, a client draws the same Tuesday twice and a provider reads it as a
 * bug in their own hours.
 */
public final class OpeningWeek {

    private OpeningWeek() {
    }

    /**
     * Merges overlapping and touching windows within each day.
     *
     * <p>Touching counts: 08:00-12:00 beside 12:00-18:00 is one stretch from
     * eight to six, because there is no minute in between during which the shop
     * is shut.
     *
     * <p>Windows that run past midnight are passed through untouched rather than
     * merged. Folding them in correctly means unrolling a day into more than
     * twenty-four hours and folding it back, and the only thing that buys is a
     * tidier grid for a business open around the clock - which this one is not.
     * They are still returned, in order, so nothing disappears.
     */
    public static List<OpenWindow> merge(List<OpenWindow> windows) {
        List<OpenWindow> merged = new ArrayList<>();
        for (int day = 1; day <= 7; day++) {
            int today = day;
            List<OpenWindow> ofDay = windows.stream()
                    .filter(w -> w.dayOfWeek() == today)
                    .sorted(Comparator.comparing(OpenWindow::start)
                                      .thenComparing(OpenWindow::end))
                    .toList();
            merged.addAll(mergeOneDay(ofDay));
        }
        return List.copyOf(merged);
    }

    private static List<OpenWindow> mergeOneDay(List<OpenWindow> ofDay) {
        List<OpenWindow> result = new ArrayList<>();
        OpenWindow open = null;
        for (OpenWindow window : ofDay) {
            if (window.wrapsMidnight()) {
                result.add(window);
            } else if (open == null) {
                open = window;
            } else if (window.start().isAfter(open.end())) {
                result.add(open);
                open = window;
            } else if (window.end().isAfter(open.end())) {
                open = new OpenWindow(open.dayOfWeek(), open.start(), window.end());
            }
            // else: entirely inside the window already open, and adds nothing.
        }
        if (open != null) {
            result.add(open);
        }
        result.sort(Comparator.comparing(OpenWindow::start));
        return result;
    }
}
