package com.carlosdealmeida.claudetodos

import java.nio.file.Files
import kotlin.io.path.createFile
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class NodeLocatorTest {
    @Test fun `finds node in a PATH dir`() {
        val dir = Files.createTempDirectory("nl")
        val exe = dir.resolve("node.exe").createFile()
        assertEquals(exe.toString(), NodeLocator.find(dir.toString(), isWindows = true))
    }

    @Test fun `null when absent`() {
        val dir = Files.createTempDirectory("nl2")
        assertNull(NodeLocator.find(dir.toString(), isWindows = true))
        assertNull(NodeLocator.find(null, isWindows = false))
    }
}
