package com.carlosdealmeida.claudetodos

fun relativeTime(nowMs: Long, thenMs: Long, locale: String): String {
    val min = ((nowMs - thenMs) / 60_000L).toInt()
    if (min < 1) return NotifyMessages.get(locale, "time.now")
    if (min < 60) return NotifyMessages.get(locale, "time.minutesAgo", "n" to min.toString())
    val hours = min / 60
    if (hours < 24) return NotifyMessages.get(locale, "time.hoursAgo", "n" to hours.toString())
    return NotifyMessages.get(locale, "time.daysAgo", "n" to (hours / 24).toString())
}
