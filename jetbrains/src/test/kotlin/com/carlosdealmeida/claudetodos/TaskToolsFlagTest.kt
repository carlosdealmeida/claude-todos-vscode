package com.carlosdealmeida.claudetodos

import kotlinx.serialization.json.JsonPrimitive
import java.io.File
import java.nio.file.Files
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class TaskToolsFlagTest {
    private fun tmp(): File = Files.createTempDirectory("taskflag").toFile()

    private fun write(file: File, text: String): File {
        file.parentFile.mkdirs()
        file.writeText(text)
        return file
    }

    @Test fun `stateOf segue as regras do TS`() {
        assertEquals(FlagState.ON, TaskToolsFlag.stateOf(JsonPrimitive("1")))
        assertEquals(FlagState.ON, TaskToolsFlag.stateOf(JsonPrimitive(" TRUE ")))
        assertEquals(FlagState.ON, TaskToolsFlag.stateOf(JsonPrimitive(1)))
        assertEquals(FlagState.ON, TaskToolsFlag.stateOf(JsonPrimitive(true)))
        assertEquals(FlagState.OFF, TaskToolsFlag.stateOf(JsonPrimitive("0")))
        assertEquals(FlagState.OFF, TaskToolsFlag.stateOf(JsonPrimitive(false)))
        assertEquals(FlagState.ABSENT, TaskToolsFlag.stateOf(null))
        assertEquals(FlagState.ABSENT, TaskToolsFlag.stateOf(JsonPrimitive("yes")))
    }

    @Test fun `on vence off e off vence ausente`() {
        assertEquals(FlagState.ON, TaskToolsFlag.combine(listOf(FlagState.OFF, FlagState.ON, FlagState.ABSENT)))
        assertEquals(FlagState.OFF, TaskToolsFlag.combine(listOf(FlagState.ABSENT, FlagState.OFF)))
        assertEquals(FlagState.ABSENT, TaskToolsFlag.combine(listOf(FlagState.ABSENT)))
        assertEquals(FlagState.ABSENT, TaskToolsFlag.combine(emptyList()))
    }

    @Test fun `variavel de ambiente ligada basta`() {
        val dir = tmp()
        val state = TaskToolsFlag.read(mapOf(TaskToolsFlag.ENV to "1"), File(dir, "nada.json"), null)
        assertEquals(FlagState.ON, state)
    }

    @Test fun `settings local do projeto conta`() {
        val dir = tmp()
        write(File(dir, "proj/.claude/settings.local.json"), """{"env":{"CLAUDE_CODE_ENABLE_TODO_TOOLS":"1"}}""")
        val state = TaskToolsFlag.read(emptyMap(), File(dir, "nada.json"), File(dir, "proj").path)
        assertEquals(FlagState.ON, state)
    }

    @Test fun `arquivo ilegivel conta como ausente`() {
        val dir = tmp()
        val user = write(File(dir, "settings.json"), "{ broken")
        assertEquals(FlagState.ABSENT, TaskToolsFlag.read(emptyMap(), user, null))
        assertEquals(FlagState.ABSENT, TaskToolsFlag.readFile(File(dir, "inexistente.json")))
    }

    @Test fun `enable cria o arquivo quando ausente`() {
        val dir = tmp()
        val file = File(dir, "novo/pasta/settings.json")
        assertTrue(TaskToolsFlag.enable(file))
        assertEquals("{\n  \"env\": {\n    \"CLAUDE_CODE_ENABLE_TODO_TOOLS\": \"1\"\n  }\n}", file.readText())
        assertEquals(FlagState.ON, TaskToolsFlag.readFile(file))
    }

    @Test fun `enable preserva as outras chaves e e idempotente`() {
        val dir = tmp()
        val file = write(File(dir, "settings.json"), """{"hooks":{},"model":"opus","env":{"X":"y"}}""")
        assertTrue(TaskToolsFlag.enable(file))
        assertEquals(
            "{\n  \"hooks\": {},\n  \"model\": \"opus\",\n  \"env\": {\n    \"X\": \"y\",\n    \"CLAUDE_CODE_ENABLE_TODO_TOOLS\": \"1\"\n  }\n}",
            file.readText(),
        )
        val after = file.readText()
        assertFalse(TaskToolsFlag.enable(file))
        assertEquals(after, file.readText())
    }

    @Test fun `enable lanca com json invalido e nao toca no arquivo`() {
        val dir = tmp()
        val file = write(File(dir, "settings.json"), "{ broken")
        assertFailsWith<IllegalStateException> { TaskToolsFlag.enable(file) }
        assertEquals("{ broken", file.readText())
    }

    @Test fun `enable lanca quando env nao e objeto`() {
        val dir = tmp()
        val file = write(File(dir, "settings.json"), """{"env":[1]}""")
        assertFailsWith<IllegalStateException> { TaskToolsFlag.enable(file) }
        assertEquals("""{"env":[1]}""", file.readText())
    }
}
