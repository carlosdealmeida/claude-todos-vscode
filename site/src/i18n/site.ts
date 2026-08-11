import type { Locale } from '../../../src/i18n/locale';
import type { FeatureId } from '../demo/types';

// IDs dos tres roteiros embarcados em site/src/demo/scripts/*.json — o `id`
// de cada DemoScript. Nao importado de demo/types.ts (fora do diff permitido
// desta task) porque DemoScript.id e string generica, sem union literal.
export type ScenarioId = 'smoke-test' | 'contexto-critico' | 'lista-defasada';

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
};

export const SITE_STRINGS: Record<Locale, SiteStrings> = {
  en,
  'pt-br': ptBr,
  es,
  'zh-cn': zhCn,
  'zh-tw': zhTw,
};
