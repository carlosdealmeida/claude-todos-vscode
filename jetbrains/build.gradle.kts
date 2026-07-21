plugins {
    id("java")
    id("org.jetbrains.kotlin.jvm") version "2.1.0"
    id("org.jetbrains.kotlin.plugin.serialization") version "2.1.0"
    id("org.jetbrains.intellij.platform") version "2.2.1"
}

group = "com.carlosdealmeida"
version = providers.gradleProperty("pluginVersion").getOrElse("0.0.0-dev")

// Versão do IDE alvo, usada tanto para resolver a plataforma (compile/test) quanto para o
// verifyPlugin — as duas precisam apontar para a mesma versão.
val ideVersion = "2024.2.4"

repositories {
    mavenCentral()
    intellijPlatform { defaultRepositories() }
}

dependencies {
    intellijPlatform {
        create("IC", ideVersion)
    }
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")
    testImplementation(kotlin("test"))
    testImplementation("org.junit.jupiter:junit-jupiter:5.10.2")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

kotlin { jvmToolchain(21) }

intellijPlatform {
    pluginConfiguration {
        id = "com.carlosdealmeida.claude-todos"
        name = "Claude Todos"
        ideaVersion {
            sinceBuild = "242"
            untilBuild = provider { null }
        }
        changeNotes = "See <a href=\"https://github.com/carlosdealmeida/claude-todos-vscode/releases\">GitHub Releases</a>."
        vendor {
            name = "carlosdealmeida"
            url = "https://github.com/carlosdealmeida/claude-todos-vscode"
            email = "carlos.dealmeiida@gmail.com"
        }
    }
    signing {
        certificateChain = providers.environmentVariable("JB_CERTIFICATE_CHAIN")
        privateKey = providers.environmentVariable("JB_PRIVATE_KEY")
        password = providers.environmentVariable("JB_PRIVATE_KEY_PASSWORD")
    }
    publishing {
        token = providers.environmentVariable("JB_MARKETPLACE_TOKEN")
    }
    // Task 7: verifyPlugin (IntelliJ Plugin Verifier) precisa saber contra qual IDE
    // rodar — sem isso a task falha com "No IDE resolved for verification" mesmo com
    // defaultRepositories() configurado. Reusa a mesma versão já resolvida para compile/test.
    pluginVerification {
        ides {
            ide("IC", ideVersion)
        }
    }
}

tasks.test { useJUnitPlatform() }

// Copia os artefatos da build npm (raiz do repo) para os resources do plugin.
// Pré-requisito: `npm run build` na raiz. Falha com instrução clara se faltar.
val syncWebAssets by tasks.registering(Copy::class) {
    val dist = rootDir.resolve("../dist")
    doFirst {
        require(
            dist.resolve("webview/main.js").exists() &&
                dist.resolve("webview/index.css").exists() &&
                dist.resolve("core/main.js").exists() &&
                dist.resolve("hooks/sessionStart.js").exists()
        ) {
            "Artefatos npm ausentes em ../dist — rode `npm run build` na raiz do repo antes."
        }
    }
    from(dist.resolve("webview/main.js"), dist.resolve("webview/index.css"))
    from(dist.resolve("core/main.js")) { rename { "core-main.js" } }
    from(dist.resolve("hooks/sessionStart.js")) { rename { "hook.js" } }
    into(layout.projectDirectory.dir("src/main/resources/claudetodos"))
}

tasks.processResources { dependsOn(syncWebAssets) }
