import { describe, expect, it } from 'vitest';
import { resolveAgentHomeFiles } from '../../src/main/services/agent-config.service';

describe('resolveAgentHomeFiles', () => {
  it('builds Codex home files that match the real custom provider shape', () => {
    const files = resolveAgentHomeFiles({
      agentTool: 'codex',
      apiKey: 'sk-test',
      baseUrl: 'https://example.com/v1',
      defaultModel: 'gpt-5.4',
    });

    const authFile = files.find((file) => file.relativePath === '.codex/auth.json');
    const configFile = files.find((file) => file.relativePath === '.codex/config.toml');

    expect(authFile).toBeTruthy();
    expect(configFile).toBeTruthy();
    expect(JSON.parse(authFile!.content)).toEqual({
      OPENAI_API_KEY: 'sk-test',
    });

    expect(configFile!.content).toContain('model_provider = "custom"');
    expect(configFile!.content).toContain('model = "gpt-5.4"');
    expect(configFile!.content).toContain('[model_providers.custom]');
    expect(configFile!.content).toContain('name = "custom"');
    expect(configFile!.content).toContain('wire_api = "responses"');
    expect(configFile!.content).toContain('requires_openai_auth = true');
    expect(configFile!.content).toContain('base_url = "https://example.com/v1"');
  });
});
