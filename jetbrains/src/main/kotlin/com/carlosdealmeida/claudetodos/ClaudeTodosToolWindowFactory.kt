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
import com.intellij.util.concurrency.AppExecutorUtil
import com.intellij.util.ui.JBUI
import java.util.Locale
import javax.swing.JPanel
import javax.swing.SwingUtilities

private const val SIDECAR_DEAD_MSG = """{"type":"error","message":"sidecar terminated"}"""

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
        val node = NodeLocator.find(com.intellij.util.EnvironmentUtil.getValue("PATH"))
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

        val locale = ideLocale()
        val bridge = NotificationBridge(project, locale, activatePanel = {
            SwingUtilities.invokeLater { toolWindow.activate(null) }
        })

        lateinit var router: MessageRouter
        val host = object : RouterHost {
            override fun openFile(path: String, line: Int) {
                SwingUtilities.invokeLater {
                    val vf = com.intellij.openapi.vfs.LocalFileSystem.getInstance().refreshAndFindFileByPath(path)
                    if (vf == null) { bridge.warn("todo.sourceMissing"); return@invokeLater }
                    com.intellij.openapi.fileEditor.FileEditorManager.getInstance(project)
                        .openTextEditor(com.intellij.openapi.fileEditor.OpenFileDescriptor(project, vf, line, 0), true)
                }
            }
            override fun pickSession(sessions: List<SessionItem>, onPick: (String?) -> Unit) {
                SwingUtilities.invokeLater {
                    val labels = mutableListOf(NotifyMessages.get(locale, "picker.auto"))
                    val ids = mutableListOf<String?>(null)
                    val now = System.currentTimeMillis()
                    for (s in sessions) {
                        labels += "${s.title} · ${s.sessionId.take(8)} · ${relativeTime(now, s.updatedAt, locale)}"
                        ids += s.sessionId
                    }
                    com.intellij.openapi.ui.popup.JBPopupFactory.getInstance()
                        .createPopupChooserBuilder(labels)
                        .setTitle("Claude Todos")
                        .setItemChosenCallback { chosen -> onPick(ids[labels.indexOf(chosen)]) }
                        .createPopup()
                        .showCenteredInCurrentWindow(project)
                }
            }
            override fun onNotification(kinds: List<String>, awaitingInput: String?, title: String?) {
                SwingUtilities.invokeLater { bridge.toast(kinds, awaitingInput, title) }
            }
            override fun activatePanel() { SwingUtilities.invokeLater { toolWindow.activate(null) } }
            override fun warn(messageKey: String) { SwingUtilities.invokeLater { bridge.warn(messageKey) } }
        }
        router = MessageRouter(
            sendToSidecar = sidecar::send,
            sendToWebview = { json -> SwingUtilities.invokeLater { panel.post(json) } },
            locale = locale,
            host = host,
        )

        val observeTimer = javax.swing.Timer(10_000) { router.observe() }.apply { start() }
        com.intellij.openapi.util.Disposer.register(toolWindow.disposable) { observeTimer.stop() }

        panel.load(onMessage = router::onWebviewMessage)
        // Desvio autorizado (review da Task 6): start() pode lançar de forma síncrona se o
        // spawn do processo falhar (ex.: node removido do PATH entre o find() e o start()).
        // Cobrimos com o mesmo erro do onDead, em vez de deixar a exceção subir e quebrar
        // a criação do tool window.
        // start() faz IO síncrono (extração do bundle + spawn do processo) — despachado fora
        // da EDT para não travar a UI na criação do tool window.
        AppExecutorUtil.getAppExecutorService().execute {
            runCatching {
                sidecar.start(
                    onEvent = router::onSidecarEvent,
                    onDead = {
                        SwingUtilities.invokeLater {
                            panel.post(SIDECAR_DEAD_MSG)
                        }
                    },
                )
            }.onFailure { e ->
                log.warn("claude-todos: falha ao iniciar sidecar", e)
                SwingUtilities.invokeLater {
                    panel.post(SIDECAR_DEAD_MSG)
                }
            }

            // runCatching próprio, separado do start(): uma falha aqui (cópia do hook
            // travada no Windows, ~/.claude read-only) não é uma falha do sidecar — não
            // deve postar SIDECAR_DEAD_MSG (o painel mostraria "sidecar terminated" falso
            // com o sidecar rodando normalmente). Só loga; o prompt de hook fica perdido
            // nessa sessão, aceitável.
            runCatching {
                val hookPath = HookSetup.ensureHookScript()
                router.requestHookStatus(hookPath) { installed ->
                    if (!installed) SwingUtilities.invokeLater {
                        bridge.promptHookInstall(onInstall = {
                            router.installHook(hookPath) { ok ->
                                SwingUtilities.invokeLater {
                                    if (ok) bridge.confirmHookInstalled() else bridge.hookInstallFailed("install failed")
                                }
                            }
                        })
                    }
                }
            }.onFailure { e ->
                log.warn("claude-todos: falha ao preparar hook", e)
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
