package com.carlosdealmeida.claudetodos

import com.intellij.ide.ui.LafManagerListener
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.ui.components.JBLabel
import com.intellij.ui.content.ContentFactory
import com.intellij.ui.jcef.JBCefApp
import com.intellij.util.ui.JBUI
import java.util.Locale
import javax.swing.JPanel
import javax.swing.SwingUtilities

class ClaudeTodosToolWindowFactory : ToolWindowFactory {
    private val log = Logger.getInstance(ClaudeTodosToolWindowFactory::class.java)

    override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
        val factory = ContentFactory.getInstance()

        if (!JBCefApp.isSupported()) {
            toolWindow.contentManager.addContent(
                factory.createContent(message("Este IDE não suporta JCEF — painel indisponível."), "", false),
            )
            return
        }
        val node = NodeLocator.find()
        if (node == null) {
            toolWindow.contentManager.addContent(
                factory.createContent(
                    message("Node.js não encontrado no PATH. Instale em nodejs.org e reinicie o IDE."), "", false,
                ),
            )
            return
        }

        val panel = WebviewPanel(toolWindow.disposable)
        val sidecar = SidecarProcess(node, project)
        com.intellij.openapi.util.Disposer.register(toolWindow.disposable, sidecar)

        val router = MessageRouter(
            sendToSidecar = sidecar::send,
            sendToWebview = { json -> SwingUtilities.invokeLater { panel.post(json) } },
            locale = ideLocale(),
        )

        panel.load(onMessage = router::onWebviewMessage)
        // Desvio autorizado (review da Task 6): start() pode lançar de forma síncrona se o
        // spawn do processo falhar (ex.: node removido do PATH entre o find() e o start()).
        // Cobrimos com o mesmo erro do onDead, em vez de deixar a exceção subir e quebrar
        // a criação do tool window.
        runCatching {
            sidecar.start(
                onEvent = router::onSidecarEvent,
                onDead = {
                    SwingUtilities.invokeLater {
                        panel.post("""{"type":"error","message":"sidecar terminated"}""")
                    }
                },
            )
        }.onFailure { e ->
            log.warn("claude-todos: falha ao iniciar sidecar", e)
            SwingUtilities.invokeLater {
                panel.post("""{"type":"error","message":"sidecar terminated"}""")
            }
        }

        ApplicationManager.getApplication().messageBus.connect(toolWindow.disposable)
            .subscribe(LafManagerListener.TOPIC, LafManagerListener {
                SwingUtilities.invokeLater { panel.updateThemeVars() }
            })

        toolWindow.contentManager.addContent(factory.createContent(panel.component, "", false))
    }

    private fun message(text: String): JPanel = JPanel().apply {
        add(JBLabel(text).apply { border = JBUI.Borders.empty(16) })
    }

    private fun ideLocale(): String = when (Locale.getDefault().language) {
        "pt" -> "pt-br"
        "es" -> "es"
        else -> "en"
    }
}
