package com.carlosdealmeida.claudetodos

import kotlin.test.Test
import kotlin.test.assertEquals

class RelativeTimeTest {
    private val now = 1_000_000_000_000L
    @Test fun `bands match the vscode helper`() {
        assertEquals(NotifyMessages.get("en", "time.now"), relativeTime(now, now - 30_000, "en"))
        assertEquals(NotifyMessages.get("en", "time.minutesAgo", "n" to "5"), relativeTime(now, now - 5 * 60_000, "en"))
        assertEquals(NotifyMessages.get("en", "time.hoursAgo", "n" to "3"), relativeTime(now, now - 3 * 3_600_000, "en"))
        assertEquals(NotifyMessages.get("en", "time.daysAgo", "n" to "2"), relativeTime(now, now - 48 * 3_600_000, "en"))
    }
}
