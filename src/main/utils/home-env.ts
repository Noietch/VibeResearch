import os from 'os';

export function createHomeOverrideEnv(homeDir: string): Record<'HOME' | 'USERPROFILE', string> {
  return {
    HOME: homeDir,
    USERPROFILE: homeDir,
  };
}

export function resolveHomeWorkingDirectory(
  env: Partial<Record<'HOME' | 'USERPROFILE', string | undefined>>,
  fallback = os.homedir(),
): string {
  const home = env.HOME?.trim();
  if (home) return home;

  const userProfile = env.USERPROFILE?.trim();
  if (userProfile) return userProfile;

  return fallback;
}
