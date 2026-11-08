// Reads and validates the settings of the AI provider. A bad or missing value
// stops startup with a message that names the variable, instead of failing on
// the first request.

import type { AiProviderName } from './ai-provider.interface.js';

/** Default time limit of one provider call. The platform limit is 60 seconds. */
export const DEFAULT_AI_TIMEOUT_MS = 10_000;
/** Highest value accepted, so that the database work still fits in the platform limit. */
export const MAX_AI_TIMEOUT_MS = 50_000;

export interface AiConfig {
  provider: AiProviderName;
  timeoutMs: number;
  gemini?: { apiKey: string; model: string };
  local?: { endpoint: string };
}

type Read = (key: string) => string | undefined;

function readTimeout(read: Read): number {
  const raw = read('AI_TIMEOUT_MS')?.trim();
  if (!raw) return DEFAULT_AI_TIMEOUT_MS;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > MAX_AI_TIMEOUT_MS) {
    throw new Error(
      `Invalid AI_TIMEOUT_MS: "${raw}". Use a whole number of milliseconds between 1 and ${MAX_AI_TIMEOUT_MS}.`,
    );
  }
  return value;
}

export function readAiConfig(read: Read): AiConfig {
  const provider = read('AI_PROVIDER')?.trim() || 'gemini';
  const timeoutMs = readTimeout(read);

  if (provider === 'gemini') {
    const apiKey = read('GEMINI_API_KEY')?.trim();
    if (!apiKey) {
      throw new Error(
        'GEMINI_API_KEY is required when AI_PROVIDER is "gemini".',
      );
    }
    const model = read('GEMINI_MODEL')?.trim();
    if (!model) {
      throw new Error(
        'GEMINI_MODEL is required when AI_PROVIDER is "gemini". Set the exact model name; an alias such as "-latest" is not accepted.',
      );
    }
    if (/-latest$/i.test(model)) {
      throw new Error(
        `Invalid GEMINI_MODEL: "${model}". A "-latest" alias is not accepted; set the exact model name.`,
      );
    }
    return { provider, timeoutMs, gemini: { apiKey, model } };
  }

  if (provider === 'local') {
    if (read('NODE_ENV')?.trim() === 'production') {
      throw new Error(
        'AI_PROVIDER "local" is for development only and cannot run when NODE_ENV is "production".',
      );
    }
    const endpoint = read('LOCAL_AI_ENDPOINT')?.trim();
    if (!endpoint) {
      throw new Error(
        'LOCAL_AI_ENDPOINT is required when AI_PROVIDER is "local".',
      );
    }
    return { provider, timeoutMs, local: { endpoint } };
  }

  throw new Error(
    `Invalid AI_PROVIDER: "${provider}". Allowed values: gemini | local.`,
  );
}
