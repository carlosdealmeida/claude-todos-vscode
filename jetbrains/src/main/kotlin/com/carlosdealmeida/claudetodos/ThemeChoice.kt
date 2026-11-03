package com.carlosdealmeida.claudetodos

import com.intellij.ide.util.PropertiesComponent
import com.intellij.openapi.application.ApplicationManager
import com.intellij.util.messages.Topic

/** Espelha src/themes.ts (UI_THEME_IDS). Sincronia travada pelo ThemeChoiceTest. */
object ThemeChoice {
    const val KEY = "claudeTodos.theme"
    const val DEFAULT = "classic"
    val IDS: List<String> = listOf("classic", "papel")

    fun parse(value: String?): String = if (value != null && value in IDS) value else DEFAULT

    fun load(props: PropertiesComponent = PropertiesComponent.getInstance()): String =
        parse(props.getValue(KEY))

    /** Grava e avisa todos os tool windows abertos, de qualquer projeto. */
    fun save(id: String, props: PropertiesComponent = PropertiesComponent.getInstance()) {
        props.setValue(KEY, parse(id), DEFAULT)
        ApplicationManager.getApplication().messageBus
            .syncPublisher(ThemeChoiceListener.TOPIC)
            .themeChanged(parse(id))
    }
}

fun interface ThemeChoiceListener {
    fun themeChanged(id: String)

    companion object {
        val TOPIC: Topic<ThemeChoiceListener> =
            Topic.create("claudeTodos.theme", ThemeChoiceListener::class.java)
    }
}
