import type { Locale } from '../../../src/i18n/locale';
import type { FeatureId } from '../demo/types';

// IDs dos tres roteiros embarcados em site/src/demo/scripts/*.json — o `id`
// de cada DemoScript. Nao importado de demo/types.ts (fora do diff permitido
// desta task) porque DemoScript.id e string generica, sem union literal.
export type ScenarioId = 'smoke-test' | 'contexto-critico' | 'lista-defasada';

// As tres lojas onde a extensao e publicada — mesma ordem de exibicao em
// StoreRow.astro e mesmas chaves de site/src/generated/stores.json (task-2,
// faixa de lojas). "vscode" cobre o VS Code Marketplace, "openvsx" cobre
// Open VSX (Cursor, Windsurf, VSCodium), "jetbrains" cobre o JetBrains
// Marketplace.
export type StoreId = 'vscode' | 'openvsx' | 'jetbrains';

export interface SiteStrings {
  featuresTitle: string;
  features: Record<FeatureId, string>;
  // Nome curto por cenario, usado pelo FeatureList para anunciar qual dos
  // tres roteiros embarcados esta tocando (Task 16 — troca de cenario pelo
  // botao de sessao do painel).
  scenarios: Record<ScenarioId, string>;
  // Nome acessivel do botao play/pause do demo (Demo.svelte), um por estado
  // atual — reflete a acao que o clique vai executar.
  demoPlay: string;
  demoPause: string;
  // aria-label do ThemeToggle.svelte, um por tema atual — reflete o tema
  // para o qual o clique vai trocar (o icone exibido ja segue essa logica:
  // sol quando o tema atual e escuro, lua quando e claro).
  themeToggleToLight: string;
  themeToggleToDark: string;
  // Rotulos da landing (LandingLayout.astro) que nao vem de README nenhum —
  // chrome de UI da pagina publica (topbar, swimlanes, secao de privacidade,
  // rodape), nao conteudo editorial. A constraint global do plano mira copy
  // editorial mantida a mao; rotulo curto de botao/aria-label e o mesmo tipo
  // de string que featuresTitle/demoPlay/themeToggleTo* acima ja sao — por
  // isso moram aqui, no unico catalogo de strings do site, em vez de um
  // segundo dicionario local em LandingLayout.astro.
  landingEyebrow: string;
  landingCta: string;
  landingCtaSecondary: string;
  landingStatesLabel: string;
  landingPrivacyTitle: string;
  landingReadMore: string;
  landingFooter: string;
  // Faixa de lojas (StoreRow.astro, task-2): versao e avaliacao lidas em
  // build-time de site/src/generated/stores.json. Deliberadamente SEM
  // contador de download — decisao do dono do projeto em 2026-08-11 (as tres
  // lojas medem coisas incomparaveis; ver task-2-brief.md).
  landingStoresLabel: string;
  // Exibida so quando as tres versoes coincidem; quando divergem, cada card
  // mostra sua propria versao e esta linha some — divergencia e informacao
  // legitima, nao erro a esconder (ver StoreRow.astro).
  landingStoresSameVersion: string;
  // Unidade da contagem de avaliacoes, singular/plural — hoje so o VS Code
  // Marketplace expoe rating na resposta verificada (ver task-2-brief.md);
  // Open VSX e JetBrains ficam sem esses dois campos.
  landingStoresRatingOne: string;
  landingStoresRatingOther: string;
  // Nome oficial de cada loja e os editores que ela atende. Os editores sao
  // nomes proprios (VS Code, Cursor, Windsurf, VSCodium, IntelliJ IDEA...) —
  // por isso o texto e o mesmo nos 5 idiomas, igual a tabela de instalacao
  // dos READMEs (site/scripts/extractLanding.mjs le exatamente essa tabela
  // hoje); ainda assim moram aqui, com uma entrada por locale, para
  // continuarem no unico catalogo de strings do site em vez de um segundo
  // dicionario local em StoreRow.astro.
  storeNames: Record<StoreId, string>;
  storeEditors: Record<StoreId, string>;
}

const en: SiteStrings = {
  featuresTitle: 'Explore',
  features: {
    'agent-tree': 'Live agent tree',
    'live-tasks': 'Tasks in real time',
    'task-timing': 'Per-task timing',
    'tokens-cache': 'Tokens, context and cache',
    dashboard: 'Last 7 days',
    notifications: 'Notifications',
    i18n: 'UI in 5 languages',
  },
  scenarios: {
    'smoke-test': 'Everyday session',
    'contexto-critico': 'Context near the limit',
    'lista-defasada': 'Stale checklist',
  },
  demoPlay: 'Play demo',
  demoPause: 'Pause demo',
  themeToggleToLight: 'Switch to light theme',
  themeToggleToDark: 'Switch to dark theme',
  landingEyebrow: 'VS Code · JetBrains',
  landingCta: 'Install',
  landingCtaSecondary: 'View on GitHub',
  landingStatesLabel: 'Live task states',
  landingPrivacyTitle: 'Privacy',
  landingReadMore: 'Read the full policy',
  landingFooter: 'MIT licensed, fully local. Built for Claude Code.',
  landingStoresLabel: 'Available on',
  landingStoresSameVersion: 'All three stores on the same version',
  landingStoresRatingOne: 'review',
  landingStoresRatingOther: 'reviews',
  storeNames: {
    vscode: 'VS Code Marketplace',
    openvsx: 'Open VSX',
    jetbrains: 'JetBrains Marketplace',
  },
  storeEditors: {
    vscode: 'VS Code',
    openvsx: 'Cursor · Windsurf · VSCodium',
    jetbrains: 'IntelliJ IDEA · PyCharm · WebStorm · Rider · … (2024.2+)',
  },
};

const ptBr: SiteStrings = {
  featuresTitle: 'Explore',
  features: {
    'agent-tree': 'Árvore de agentes ao vivo',
    'live-tasks': 'Tasks em tempo real',
    'task-timing': 'Tempos por task',
    'tokens-cache': 'Tokens, contexto e cache',
    dashboard: 'Últimos 7 dias',
    notifications: 'Notificações',
    i18n: 'UI em 5 idiomas',
  },
  scenarios: {
    'smoke-test': 'Sessão do dia a dia',
    'contexto-critico': 'Contexto no limite',
    'lista-defasada': 'Lista desatualizada',
  },
  demoPlay: 'Reproduzir demo',
  demoPause: 'Pausar demo',
  themeToggleToLight: 'Mudar para tema claro',
  themeToggleToDark: 'Mudar para tema escuro',
  landingEyebrow: 'VS Code · JetBrains',
  landingCta: 'Instalar',
  landingCtaSecondary: 'Ver no GitHub',
  landingStatesLabel: 'Estados da task ao vivo',
  landingPrivacyTitle: 'Privacidade',
  landingReadMore: 'Leia a política completa',
  landingFooter: 'Licença MIT, totalmente local. Feito para o Claude Code.',
  landingStoresLabel: 'Disponível em',
  landingStoresSameVersion: 'As três lojas na mesma versão',
  landingStoresRatingOne: 'avaliação',
  landingStoresRatingOther: 'avaliações',
  storeNames: {
    vscode: 'VS Code Marketplace',
    openvsx: 'Open VSX',
    jetbrains: 'JetBrains Marketplace',
  },
  storeEditors: {
    vscode: 'VS Code',
    openvsx: 'Cursor · Windsurf · VSCodium',
    jetbrains: 'IntelliJ IDEA · PyCharm · WebStorm · Rider · … (2024.2+)',
  },
};

const es: SiteStrings = {
  featuresTitle: 'Explora',
  features: {
    'agent-tree': 'Árbol de agentes en vivo',
    'live-tasks': 'Tareas en tiempo real',
    'task-timing': 'Tiempos por tarea',
    'tokens-cache': 'Tokens, contexto y caché',
    dashboard: 'Últimos 7 días',
    notifications: 'Notificaciones',
    i18n: 'IU en 5 idiomas',
  },
  scenarios: {
    'smoke-test': 'Sesión del día a día',
    'contexto-critico': 'Contexto al límite',
    'lista-defasada': 'Lista desactualizada',
  },
  demoPlay: 'Reproducir demo',
  demoPause: 'Pausar demo',
  themeToggleToLight: 'Cambiar a tema claro',
  themeToggleToDark: 'Cambiar a tema oscuro',
  landingEyebrow: 'VS Code · JetBrains',
  landingCta: 'Instalar',
  landingCtaSecondary: 'Ver en GitHub',
  landingStatesLabel: 'Estados de la tarea en vivo',
  landingPrivacyTitle: 'Privacidad',
  landingReadMore: 'Lee la política completa',
  landingFooter: 'Licencia MIT, totalmente local. Hecho para Claude Code.',
  landingStoresLabel: 'Disponible en',
  landingStoresSameVersion: 'Las tres tiendas en la misma versión',
  landingStoresRatingOne: 'reseña',
  landingStoresRatingOther: 'reseñas',
  storeNames: {
    vscode: 'VS Code Marketplace',
    openvsx: 'Open VSX',
    jetbrains: 'JetBrains Marketplace',
  },
  storeEditors: {
    vscode: 'VS Code',
    openvsx: 'Cursor · Windsurf · VSCodium',
    jetbrains: 'IntelliJ IDEA · PyCharm · WebStorm · Rider · … (2024.2+)',
  },
};

// zh-cn/zh-tw: terminologia de docs/i18n/glossary-zh.md ("agent" -> 智能体/智慧體,
// nunca 代理; "token" -> 令牌/權杖; "cache" -> 缓存/快取). Como as demais traducoes
// zh do projeto, ainda aguardam revisao de falante nativo.
const zhCn: SiteStrings = {
  featuresTitle: '探索',
  features: {
    'agent-tree': '实时智能体树',
    'live-tasks': '实时任务',
    'task-timing': '每个任务的耗时',
    'tokens-cache': '令牌、上下文和缓存',
    dashboard: '最近 7 天',
    notifications: '通知',
    i18n: '5 种语言界面',
  },
  scenarios: {
    'smoke-test': '日常会话',
    'contexto-critico': '上下文逼近上限',
    'lista-defasada': '过时的待办清单',
  },
  demoPlay: '播放演示',
  demoPause: '暂停演示',
  themeToggleToLight: '切换到浅色主题',
  themeToggleToDark: '切换到深色主题',
  landingEyebrow: 'VS Code · JetBrains',
  landingCta: '安装',
  landingCtaSecondary: '查看 GitHub',
  landingStatesLabel: '实时任务状态',
  landingPrivacyTitle: '隐私',
  landingReadMore: '阅读完整政策',
  landingFooter: 'MIT 许可，完全本地运行。为 Claude Code 打造。',
  landingStoresLabel: '可在以下平台获取',
  landingStoresSameVersion: '三个商店版本一致',
  landingStoresRatingOne: '评分',
  landingStoresRatingOther: '评分',
  storeNames: {
    vscode: 'VS Code Marketplace',
    openvsx: 'Open VSX',
    jetbrains: 'JetBrains Marketplace',
  },
  storeEditors: {
    vscode: 'VS Code',
    openvsx: 'Cursor · Windsurf · VSCodium',
    jetbrains: 'IntelliJ IDEA · PyCharm · WebStorm · Rider · …（2024.2+）',
  },
};

const zhTw: SiteStrings = {
  featuresTitle: '探索',
  features: {
    'agent-tree': '即時智慧體樹',
    'live-tasks': '即時任務',
    'task-timing': '每個任務的耗時',
    'tokens-cache': '權杖、上下文和快取',
    dashboard: '最近 7 天',
    notifications: '通知',
    i18n: '5 種語言介面',
  },
  scenarios: {
    'smoke-test': '日常工作階段',
    'contexto-critico': '上下文逼近上限',
    'lista-defasada': '過時的待辦清單',
  },
  demoPlay: '播放示範',
  demoPause: '暫停示範',
  themeToggleToLight: '切換到淺色主題',
  themeToggleToDark: '切換到深色主題',
  landingEyebrow: 'VS Code · JetBrains',
  landingCta: '安裝',
  landingCtaSecondary: '查看 GitHub',
  landingStatesLabel: '即時任務狀態',
  landingPrivacyTitle: '隱私',
  landingReadMore: '閱讀完整政策',
  landingFooter: 'MIT 授權，完全在本機執行。為 Claude Code 打造。',
  landingStoresLabel: '可在以下平台取得',
  landingStoresSameVersion: '三個商店版本一致',
  landingStoresRatingOne: '評分',
  landingStoresRatingOther: '評分',
  storeNames: {
    vscode: 'VS Code Marketplace',
    openvsx: 'Open VSX',
    jetbrains: 'JetBrains Marketplace',
  },
  storeEditors: {
    vscode: 'VS Code',
    openvsx: 'Cursor · Windsurf · VSCodium',
    jetbrains: 'IntelliJ IDEA · PyCharm · WebStorm · Rider · …（2024.2+）',
  },
};

export const SITE_STRINGS: Record<Locale, SiteStrings> = {
  en,
  'pt-br': ptBr,
  es,
  'zh-cn': zhCn,
  'zh-tw': zhTw,
};
