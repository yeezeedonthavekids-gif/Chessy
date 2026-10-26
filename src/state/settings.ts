import { createStore } from './store';

export type SkillLevel = 'beginner' | 'intermediate' | 'advanced' | 'expert';
export type AiProvider = 'none' | 'anthropic' | 'openai-compatible';

export interface Settings {
  theme: 'dark' | 'light' | 'system';
  boardTheme: 'green' | 'brown' | 'blue' | 'slate';
  skillLevel: SkillLevel;
  /** Default analysis depth for full-game review. */
  analysisDepth: number;
  chesscomUsername: string;
  lichessUsername: string;
  aliases: string;
  /** Poll public status endpoints to pause engine features during live games. */
  liveStatusChecks: boolean;
  aiProvider: AiProvider;
  anthropicModel: string;
  openaiBaseUrl: string;
  openaiModel: string;
  /** Persist the API key in localStorage (otherwise kept for this tab only). */
  rememberApiKey: boolean;
  sidebarCollapsed: boolean;
  onboarded: boolean;
}

export const defaultSettings: Settings = {
  theme: 'dark',
  boardTheme: 'green',
  skillLevel: 'intermediate',
  analysisDepth: 14,
  chesscomUsername: '',
  lichessUsername: '',
  aliases: '',
  liveStatusChecks: true,
  aiProvider: 'none',
  anthropicModel: 'claude-opus-5-5',
  openaiBaseUrl: 'http://localhost:11434/v1',
  openaiModel: 'llama3.1',
  rememberApiKey: false,
  sidebarCollapsed: false,
  onboarded: false,
};

export const settingsStore = createStore<Settings>(defaultSettings, 'chessy.settings');

export function usernames(s: Settings) {
  return {
    chesscom: s.chesscomUsername || undefined,
    lichess: s.lichessUsername || undefined,
    aliases: s.aliases
      .split(',')
      .map((a) => a.trim())
      .filter(Boolean),
  };
}

export const LEVEL_LABEL: Record<SkillLevel, string> = {
  beginner: 'Beginner (under ~1000)',
  intermediate: 'Intermediate (~1000–1600)',
  advanced: 'Advanced (~1600–2000)',
  expert: 'Expert (2000+)',
};

// ---- API key: kept out of settings so it is never exported with app data ----
const KEY_STORAGE = 'chessy.aiKey';
let memoryKey = '';

export function getApiKey(): string {
  if (memoryKey) return memoryKey;
  try {
    return sessionStorage.getItem(KEY_STORAGE) ?? localStorage.getItem(KEY_STORAGE) ?? '';
  } catch {
    return '';
  }
}

export function setApiKey(key: string, remember: boolean) {
  memoryKey = key;
  try {
    sessionStorage.removeItem(KEY_STORAGE);
    localStorage.removeItem(KEY_STORAGE);
    if (key) (remember ? localStorage : sessionStorage).setItem(KEY_STORAGE, key);
  } catch {
    /* memory only */
  }
}
