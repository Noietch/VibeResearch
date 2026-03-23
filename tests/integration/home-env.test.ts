import { describe, expect, it } from 'vitest';
import { createHomeOverrideEnv, resolveHomeWorkingDirectory } from '../../src/main/utils/home-env';

describe('home-env helpers', () => {
  it('creates HOME and USERPROFILE overrides for a temporary agent home', () => {
    expect(createHomeOverrideEnv('/tmp/researchclaw-home')).toEqual({
      HOME: '/tmp/researchclaw-home',
      USERPROFILE: '/tmp/researchclaw-home',
    });
  });

  it('prefers HOME when resolving the agent working directory', () => {
    expect(
      resolveHomeWorkingDirectory(
        {
          HOME: '  /tmp/agent-home  ',
          USERPROFILE: 'C:\\Users\\fallback',
        },
        '/fallback',
      ),
    ).toBe('/tmp/agent-home');
  });

  it('falls back to USERPROFILE when HOME is missing', () => {
    expect(
      resolveHomeWorkingDirectory(
        {
          USERPROFILE: 'C:\\Users\\ResearchClaw',
        },
        '/fallback',
      ),
    ).toBe('C:\\Users\\ResearchClaw');
  });

  it('uses the provided fallback when neither HOME nor USERPROFILE is available', () => {
    expect(resolveHomeWorkingDirectory({}, '/fallback/home')).toBe('/fallback/home');
  });
});
