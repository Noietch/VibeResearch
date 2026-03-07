import { HttpsProxyAgent } from 'https-proxy-agent';
import type { Agent } from 'node:http';
import { getProxy } from '../store/app-settings-store';

export interface ProxyTestResult {
  url: string;
  name: string;
  success: boolean;
  latency?: number; // ms
  error?: string;
}

// Test endpoints that are commonly blocked in China
const TEST_ENDPOINTS = [
  { url: 'https://www.google.com', name: 'Google' },
  { url: 'https://github.com', name: 'GitHub' },
  { url: 'https://www.youtube.com', name: 'YouTube' },
];

function getProxyAgent(): Agent | undefined {
  const proxy = getProxy();
  if (!proxy) return undefined;
  return new HttpsProxyAgent(proxy) as unknown as Agent;
}

/**
 * Test a single endpoint with optional proxy
 */
async function testEndpoint(
  url: string,
  agent?: Agent,
): Promise<{ success: boolean; latency?: number; error?: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

  const startTime = Date.now();

  try {
    const response = await fetch(url, {
      method: 'HEAD', // Only check connectivity, don't download body
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VibeResearch/1.0)' },
      ...(agent ? { agent } : {}),
    });

    clearTimeout(timeoutId);
    const latency = Date.now() - startTime;

    // Consider 2xx and 3xx as success
    if (response.ok || response.status < 400) {
      return { success: true, latency };
    }

    return { success: false, latency, error: `HTTP ${response.status}` };
  } catch (err) {
    clearTimeout(timeoutId);
    const latency = Date.now() - startTime;
    const message = err instanceof Error ? err.message : String(err);

    // Handle abort separately
    if (message.includes('abort')) {
      return { success: false, latency, error: 'Timeout (10s)' };
    }

    return { success: false, latency, error: message };
  }
}

/**
 * Test proxy connectivity to common endpoints
 * Returns results for each endpoint
 */
export async function testProxyConnectivity(): Promise<ProxyTestResult[]> {
  const agent = getProxyAgent();
  const results: ProxyTestResult[] = [];

  for (const endpoint of TEST_ENDPOINTS) {
    const result = await testEndpoint(endpoint.url, agent);
    results.push({
      url: endpoint.url,
      name: endpoint.name,
      ...result,
    });
  }

  return results;
}

/**
 * Test if proxy is configured and working
 */
export async function testProxy(): Promise<{
  hasProxy: boolean;
  results: ProxyTestResult[];
}> {
  const proxy = getProxy();
  const results = await testProxyConnectivity();

  return {
    hasProxy: !!proxy,
    results,
  };
}
