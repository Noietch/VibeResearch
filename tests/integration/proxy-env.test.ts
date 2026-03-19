import { describe, expect, it } from 'vitest';
import { buildCliProxyEnv } from '../../src/main/utils/proxy-env';

describe('proxy-env helpers', () => {
  it('returns proxy variables when CLI proxy is enabled', () => {
    expect(
      buildCliProxyEnv({
        proxyUrl: 'http://127.0.0.1:7890',
        proxyEnabled: true,
        cliToolsEnabled: true,
      }),
    ).toEqual({
      HTTP_PROXY: 'http://127.0.0.1:7890',
      HTTPS_PROXY: 'http://127.0.0.1:7890',
      ALL_PROXY: 'http://127.0.0.1:7890',
      http_proxy: 'http://127.0.0.1:7890',
      https_proxy: 'http://127.0.0.1:7890',
      all_proxy: 'http://127.0.0.1:7890',
    });
  });

  it('returns an empty object when proxy is disabled', () => {
    expect(
      buildCliProxyEnv({
        proxyUrl: 'http://127.0.0.1:7890',
        proxyEnabled: false,
        cliToolsEnabled: true,
      }),
    ).toEqual({});
  });

  it('returns an empty object when CLI tools are excluded from proxy scope', () => {
    expect(
      buildCliProxyEnv({
        proxyUrl: 'http://127.0.0.1:7890',
        proxyEnabled: true,
        cliToolsEnabled: false,
      }),
    ).toEqual({});
  });
});
