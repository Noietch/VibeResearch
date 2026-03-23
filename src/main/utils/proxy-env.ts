import type { Agent } from 'node:http';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { getProxy, getProxyEnabled, getProxyScope } from '../store/app-settings-store';
import type { ProxyScope } from '../store/app-settings-store';

export interface CliProxySettings {
  proxyUrl?: string;
  proxyEnabled: boolean;
  cliToolsEnabled: boolean;
}

export function buildCliProxyEnv(settings: CliProxySettings): Record<string, string> {
  if (!settings.proxyEnabled || !settings.cliToolsEnabled || !settings.proxyUrl) {
    return {};
  }

  const proxyUrl = settings.proxyUrl.trim();
  if (!proxyUrl) return {};

  return {
    HTTP_PROXY: proxyUrl,
    HTTPS_PROXY: proxyUrl,
    ALL_PROXY: proxyUrl,
    http_proxy: proxyUrl,
    https_proxy: proxyUrl,
    all_proxy: proxyUrl,
  };
}

export function getCliProxyEnv(): Record<string, string> {
  const scope = getProxyScope();
  return buildCliProxyEnv({
    proxyUrl: getProxy(),
    proxyEnabled: getProxyEnabled(),
    cliToolsEnabled: scope.cliTools,
  });
}

export function getProxyUrlForScope(scopeKey: keyof ProxyScope): string | undefined {
  const proxyUrl = getProxy();
  const scope = getProxyScope();
  if (!getProxyEnabled() || !proxyUrl || !scope[scopeKey]) {
    return undefined;
  }

  const trimmed = proxyUrl.trim();
  return trimmed || undefined;
}

export function getProxyAgentForScope(scopeKey: keyof ProxyScope): Agent | undefined {
  const proxyUrl = getProxyUrlForScope(scopeKey);
  return proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined;
}
