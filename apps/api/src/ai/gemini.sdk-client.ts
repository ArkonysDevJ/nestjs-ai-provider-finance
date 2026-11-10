// Transport adapter of the Gemini provider: it calls the SDK and returns the
// text and the model that served the answer, or lets the raw error propagate.
// It holds no logic, so it is covered by the live check and not by unit tests.
// The classification of errors lives in GeminiProvider.

import { GoogleGenAI } from '@google/genai';
import type { GeminiClient } from './ai-provider.interface.js';

export class GeminiSdkClient implements GeminiClient {
  private readonly ai: GoogleGenAI;

  constructor(
    apiKey: string,
    private readonly model: string,
  ) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  async generate(request: {
    prompt: string;
    timeoutMs: number;
    signal: AbortSignal;
  }): Promise<{ text: string; model?: string }> {
    const response = await this.ai.models.generateContent({
      model: this.model,
      contents: request.prompt,
      config: {
        abortSignal: request.signal,
        httpOptions: { timeout: request.timeoutMs },
      },
    });
    return { text: response.text ?? '', model: response.modelVersion };
  }
}
