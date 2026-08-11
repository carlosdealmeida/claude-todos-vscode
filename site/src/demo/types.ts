import type { SessionSnapshot, ProjectUsage } from '../../../src/types';

// As 7 features que a landing enumera; cada uma tem um marcador no roteiro.
export type FeatureId =
  | 'agent-tree'
  | 'live-tasks'
  | 'task-timing'
  | 'tokens-cache'
  | 'dashboard'
  | 'notifications'
  | 'i18n';

export interface DemoMarker {
  feature: FeatureId;
  atMs: number;
}

export interface DemoFrame {
  atMs: number;
  snapshot: SessionSnapshot;
}

export interface DemoScript {
  id: string;
  recordedAt: number;   // epoch ms da gravacao — base da reancoragem
  durationMs: number;
  markers: DemoMarker[];
  frames: DemoFrame[];  // ordenados por atMs crescente
  projectUsage: ProjectUsage;
}
