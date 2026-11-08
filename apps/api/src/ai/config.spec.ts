import {
  DEFAULT_AI_TIMEOUT_MS,
  MAX_AI_TIMEOUT_MS,
  readAiConfig,
} from './config.js';

const PLATFORM_REQUEST_TIMEOUT_MS = 60_000;

function read(env: Record<string, string | undefined>) {
  return readAiConfig((key) => env[key]);
}

const gemini = {
  AI_PROVIDER: 'gemini',
  GEMINI_API_KEY: 'k',
  GEMINI_MODEL: 'model-x',
};

describe('readAiConfig', () => {
  describe('timeout', () => {
    it('AC-4: the default is well below the platform request timeout', () => {
      expect(read(gemini).timeoutMs).toBe(DEFAULT_AI_TIMEOUT_MS);
      expect(DEFAULT_AI_TIMEOUT_MS).toBeLessThan(
        PLATFORM_REQUEST_TIMEOUT_MS / 2,
      );
      expect(MAX_AI_TIMEOUT_MS).toBeLessThan(PLATFORM_REQUEST_TIMEOUT_MS);
    });

    it('AC-4: AI_TIMEOUT_MS overrides the default', () => {
      expect(read({ ...gemini, AI_TIMEOUT_MS: '2500' }).timeoutMs).toBe(2500);
    });

    it.each(['0', '-5', 'abc', '1.5', String(MAX_AI_TIMEOUT_MS + 1)])(
      'AC-4: AI_TIMEOUT_MS="%s" stops startup',
      (value) => {
        expect(() => read({ ...gemini, AI_TIMEOUT_MS: value })).toThrow(
          /AI_TIMEOUT_MS/,
        );
      },
    );
  });

  describe('gemini', () => {
    it('reads the key and the exact model', () => {
      expect(read(gemini).gemini).toEqual({ apiKey: 'k', model: 'model-x' });
    });

    it('is the provider when AI_PROVIDER is not set', () => {
      expect(read({ GEMINI_API_KEY: 'k', GEMINI_MODEL: 'm' }).provider).toBe(
        'gemini',
      );
    });

    it('AC-10: a missing model stops startup with a message that names the variable', () => {
      expect(() =>
        read({ AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'k' }),
      ).toThrow(/GEMINI_MODEL is required/);
      expect(() => read({ ...gemini, GEMINI_MODEL: '   ' })).toThrow(
        /GEMINI_MODEL is required/,
      );
    });

    it('AC-10: a "-latest" alias stops startup', () => {
      expect(() =>
        read({ ...gemini, GEMINI_MODEL: 'some-flash-latest' }),
      ).toThrow(/-latest/);
    });

    it('a missing key stops startup', () => {
      expect(() => read({ AI_PROVIDER: 'gemini', GEMINI_MODEL: 'm' })).toThrow(
        /GEMINI_API_KEY is required/,
      );
    });
  });

  describe('local', () => {
    const local = {
      AI_PROVIDER: 'local',
      LOCAL_AI_ENDPOINT: 'http://127.0.0.1:8765/mcp',
    };

    it('reads the endpoint outside production', () => {
      expect(read({ ...local, NODE_ENV: 'development' }).local).toEqual({
        endpoint: 'http://127.0.0.1:8765/mcp',
      });
      expect(read(local).provider).toBe('local');
    });

    it('AC-8: stops startup when NODE_ENV is production', () => {
      expect(() => read({ ...local, NODE_ENV: 'production' })).toThrow(
        /development only/,
      );
    });

    it('a missing endpoint stops startup', () => {
      expect(() => read({ AI_PROVIDER: 'local' })).toThrow(
        /LOCAL_AI_ENDPOINT is required/,
      );
    });
  });

  it('AC-7: a value other than gemini or local stops startup', () => {
    expect(() => read({ AI_PROVIDER: 'openai' })).toThrow(
      /Invalid AI_PROVIDER/,
    );
  });
});
