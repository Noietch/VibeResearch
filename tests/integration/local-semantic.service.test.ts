import { afterEach, describe, expect, it, vi } from 'vitest';

const proxyFetch = vi.fn();
const getSemanticSearchSettings = vi.fn();
const getProxyAgentForScope = vi.fn(() => undefined);

vi.mock('../../src/main/services/proxy-fetch', () => ({
  proxyFetch,
}));

vi.mock('../../src/main/store/app-settings-store', () => ({
  getSemanticSearchSettings,
}));

vi.mock('../../src/main/utils/proxy-env', () => ({
  getProxyAgentForScope,
}));

describe('local semantic service', () => {
  afterEach(() => {
    proxyFetch.mockReset();
    getSemanticSearchSettings.mockReset();
    getProxyAgentForScope.mockReset();
    getProxyAgentForScope.mockReturnValue(undefined);
    vi.resetModules();
  });

  it('recreates the embedding provider when overrides change the config', async () => {
    getSemanticSearchSettings.mockReturnValue({
      enabled: true,
      autoProcess: true,
      autoEnrich: true,
      embeddingModel: 'text-embedding-3-small',
      embeddingProvider: 'openai-compatible',
      embeddingApiBase: 'https://old.example/v1',
      recommendationExploration: 0.35,
    });

    proxyFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: () =>
        JSON.stringify({
          data: [{ index: 0, embedding: [0.1, 0.2, 0.3] }],
        }),
    });

    const { localSemanticService } = await import('../../src/main/services/local-semantic.service');

    await localSemanticService.embedTexts(['first request']);
    await localSemanticService.embedTexts(['second request'], {
      embeddingProvider: 'openai-compatible',
      embeddingModel: 'text-embedding-3-large',
      embeddingApiBase: 'https://new.example/v1/',
      embeddingApiKey: 'sk-test',
    });

    expect(proxyFetch).toHaveBeenCalledTimes(2);

    const firstCall = proxyFetch.mock.calls[0] as [string, Record<string, unknown>];
    expect(firstCall[0]).toBe('https://old.example/v1/embeddings');
    expect((firstCall[1].headers as Record<string, string>)['Authorization']).toBeUndefined();
    expect(JSON.parse(firstCall[1].body as string)).toMatchObject({
      model: 'text-embedding-3-small',
      input: ['first request'],
    });

    const secondCall = proxyFetch.mock.calls[1] as [string, Record<string, unknown>];
    expect(secondCall[0]).toBe('https://new.example/v1/embeddings');
    expect((secondCall[1].headers as Record<string, string>)['Authorization']).toBe(
      'Bearer sk-test',
    );
    expect(JSON.parse(secondCall[1].body as string)).toMatchObject({
      model: 'text-embedding-3-large',
      input: ['second request'],
    });
  });
});
