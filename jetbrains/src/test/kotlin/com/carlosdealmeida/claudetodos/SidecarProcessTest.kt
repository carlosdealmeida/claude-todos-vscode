package com.carlosdealmeida.claudetodos

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals

class SidecarProcessTest {
    @Test fun `contentKey is stable for equal bytes and differs for different bytes`() {
        val a = "console.log(1)".toByteArray()
        assertEquals(contentKey(a), contentKey(a.copyOf()))
        assertNotEquals(contentKey(a), contentKey("console.log(2)".toByteArray()))
    }

    @Test fun `contentKey is hex`() {
        assert(Regex("^[0-9a-f]{1,8}$").matches(contentKey("x".toByteArray())))
    }
}
