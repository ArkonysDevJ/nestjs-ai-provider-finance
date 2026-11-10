import { ConfigService } from '@nestjs/config';
import type { AIProvider } from './ai-provider.interface.js';
import { aiProviderFactory, selectAiProvider } from './ai.module.js';
import { readAiConfig } from './config.js';

function spyFactories() {
  const built: string[] = [];
  const make = (name: 'gemini' | 'local'): AIProvider => ({
    providerName: name,
    classify: async () => {
      throw new Error('not used');
    },
  });
  return {
    built,
    factories: {
      gemini: () => {
        built.push('gemini');
        return make('gemini');
      },
      local: () => {
        built.push('local');
        return make('local');
      },
    },
  };
}

const read = (env: Record<string, string>) => readAiConfig((key) => env[key]);

describe('provider selection', () => {
  it('AC-7: gemini builds the Gemini provider and never constructs the local one', () => {
    const { built, factories } = spyFactories();
    const provider = selectAiProvider(
      read({ AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'k', GEMINI_MODEL: 'm' }),
      factories,
    );
    expect(provider.providerName).toBe('gemini');
    expect(built).toEqual(['gemini']);
  });

  it('AC-7: local builds the local provider and never constructs the Gemini one', () => {
    const { built, factories } = spyFactories();
    const provider = selectAiProvider(
      read({
        AI_PROVIDER: 'local',
        LOCAL_AI_ENDPOINT: 'http://127.0.0.1:8765/mcp',
      }),
      factories,
    );
    expect(provider.providerName).toBe('local');
    expect(built).toEqual(['local']);
  });
});

describe('startup (the factory Nest runs)', () => {
  const run = (env: Record<string, string>) =>
    aiProviderFactory(new ConfigService(env));

  it('AC-7: an invalid AI_PROVIDER stops startup', () => {
    expect(() => run({ AI_PROVIDER: 'openai' })).toThrow(/Invalid AI_PROVIDER/);
  });

  it('AC-8: local with NODE_ENV=production stops startup', () => {
    expect(() =>
      run({
        AI_PROVIDER: 'local',
        NODE_ENV: 'production',
        LOCAL_AI_ENDPOINT: 'http://127.0.0.1:8765/mcp',
      }),
    ).toThrow(/development only/);
  });

  it('AC-10: gemini without the model variable stops startup', () => {
    expect(() => run({ AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'k' })).toThrow(
      /GEMINI_MODEL is required/,
    );
  });

  it('builds the real Gemini provider without touching the network', () => {
    const provider = run({
      AI_PROVIDER: 'gemini',
      GEMINI_API_KEY: 'test-key',
      GEMINI_MODEL: 'model-x',
    });
    expect(provider.providerName).toBe('gemini');
  });

  it('builds the real local provider without loading the MCP SDK', () => {
    const provider = run({
      AI_PROVIDER: 'local',
      LOCAL_AI_ENDPOINT: 'http://127.0.0.1:8765/mcp',
    });
    expect(provider.providerName).toBe('local');
  });
});
