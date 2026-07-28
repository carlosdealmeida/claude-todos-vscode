import type { Locale } from '../../../src/i18n/locale';
import type { FeatureId } from '../demo/types';

export interface SiteStrings {
  featuresTitle: string;
  features: Record<FeatureId, string>;
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
};

// Os demais locales caem para `en` ate a Task 14 preencher as traducoes.
export const SITE_STRINGS: Record<Locale, SiteStrings> = {
  en,
  'pt-br': en,
  es: en,
  'zh-cn': en,
  'zh-tw': en,
};
