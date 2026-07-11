import { describe, expect, it } from 'vitest';
import { resolveModel } from './index.js';

describe('resolveModel (STE-21 Fase A)', () => {
  it('falls back to the legacy string route when JATEVO_API_KEY is absent', () => {
    const model = resolveModel({} as NodeJS.ProcessEnv);
    expect(model).toBe('openrouter/anthropic/claude-sonnet-4.5');
  });

  it('honors SOROSENSE_MODEL on the fallback path (still a string route)', () => {
    const model = resolveModel({ SOROSENSE_MODEL: 'custom/route' } as NodeJS.ProcessEnv);
    expect(model).toBe('custom/route');
  });

  it('selects a Jatevo OpenAI-compatible config when JATEVO_API_KEY is set', () => {
    const model = resolveModel({
      JATEVO_API_KEY: 'secret-key',
      SOROSENSE_MODEL: 'gpt-5.4-mini',
    } as NodeJS.ProcessEnv);
    expect(model).toEqual({
      providerId: 'jatevo',
      modelId: 'gpt-5.4-mini',
      url: 'https://2.jatevo.ai/v1',
      apiKey: 'secret-key',
    });
  });

  it('defaults model id and base URL, and honors JATEVO_BASE_URL override', () => {
    const withDefaults = resolveModel({ JATEVO_API_KEY: 'k' } as NodeJS.ProcessEnv);
    expect(withDefaults).toEqual({
      providerId: 'jatevo',
      modelId: 'gpt-5.4-mini',
      url: 'https://2.jatevo.ai/v1',
      apiKey: 'k',
    });

    const override = resolveModel({
      JATEVO_API_KEY: 'k',
      JATEVO_BASE_URL: 'https://alt.jatevo.ai/v1',
    } as NodeJS.ProcessEnv);
    expect(override).toMatchObject({ url: 'https://alt.jatevo.ai/v1' });
  });
});
