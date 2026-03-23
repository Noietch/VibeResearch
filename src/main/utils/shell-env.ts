/**
 * Shell environment utilities for the main process.
 *
 * Loads environment variables from the user's login shell so that child
 * processes spawned by Electron (e.g. npx, codex, goose ...) inherit the
 * correct PATH, even when the app is launched from Finder / launchd
 * instead of a terminal.
 *
 * Based on AionUi's shellEnv.ts pattern.
 */

import { execFileSync, execSync } from 'child_process';
import os from 'os';
import path from 'path';
import { existsSync } from 'fs';

/**
 * Environment variables to inherit from user's shell.
 * These may not be available when Electron app starts from Finder/launchd.
 */
const SHELL_INHERITED_ENV_VARS = [
  'PATH',
  'NODE_EXTRA_CA_CERTS',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'OPENAI_API_KEY',
  'GOOGLE_API_KEY',
  'GEMINI_API_KEY',
] as const;

/** Cache for shell environment (loaded once per session) */
let cachedShellEnv: Record<string, string> | null = null;

function uniqueStrings(values: Array<string | undefined | null>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed) continue;
    const key = process.platform === 'win32' ? trimmed.toLowerCase() : trimmed;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

function getWindowsRootCandidates(env: Record<string, string | undefined>): string[] {
  const systemDriveCandidates = uniqueStrings([
    env.SystemDrive,
    env.SYSTEMDRIVE,
    process.env.SystemDrive,
    process.env.SYSTEMDRIVE,
  ]).map((drive) => path.join(drive, 'Windows'));

  return uniqueStrings([
    env.SystemRoot,
    env.SYSTEMROOT,
    env.windir,
    env.WINDIR,
    process.env.SystemRoot,
    process.env.SYSTEMROOT,
    process.env.windir,
    process.env.WINDIR,
    ...systemDriveCandidates,
    'C:\\Windows',
  ]);
}

function getWindowsSystemPathEntries(env: Record<string, string | undefined>): string[] {
  if (process.platform !== 'win32') return [];

  const candidates = getWindowsRootCandidates(env).flatMap((root) => [
    root,
    path.join(root, 'System32'),
    path.join(root, 'System32', 'Wbem'),
    path.join(root, 'System32', 'WindowsPowerShell', 'v1.0'),
    path.join(root, 'Sysnative'),
  ]);

  return uniqueStrings(candidates).filter((candidate) => existsSync(candidate));
}

/**
 * Load environment variables from user's login shell.
 * Captures variables set in .bashrc, .zshrc, .bash_profile, etc.
 */
function loadShellEnvironment(): Record<string, string> {
  if (cachedShellEnv !== null) {
    return cachedShellEnv;
  }

  cachedShellEnv = {};

  // Skip on Windows - shell config loading not needed
  if (process.platform === 'win32') {
    return cachedShellEnv;
  }

  try {
    const shell = process.env.SHELL || '/bin/zsh';
    if (!path.isAbsolute(shell)) {
      console.warn('[ShellEnv] SHELL is not an absolute path, skipping shell env loading:', shell);
      return cachedShellEnv;
    }

    // Use -i (interactive) and -l (login) to load all shell configs
    // including .bashrc, .zshrc, .bash_profile, .zprofile, etc.
    const output = execFileSync(shell, ['-i', '-l', '-c', 'env'], {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, HOME: os.homedir() },
    });

    // Parse and capture only the variables we need
    for (const line of output.split('\n')) {
      const eqIndex = line.indexOf('=');
      if (eqIndex > 0) {
        const key = line.substring(0, eqIndex);
        const value = line.substring(eqIndex + 1);
        if (SHELL_INHERITED_ENV_VARS.includes(key as (typeof SHELL_INHERITED_ENV_VARS)[number])) {
          cachedShellEnv[key] = value;
        }
      }
    }

    if (cachedShellEnv.PATH) {
      console.log(
        '[ShellEnv] Loaded PATH from shell:',
        cachedShellEnv.PATH.substring(0, 100) + '...',
      );
    }
  } catch (error) {
    console.warn(
      '[ShellEnv] Failed to load shell environment:',
      error instanceof Error ? error.message : String(error),
    );
  }

  return cachedShellEnv;
}

/**
 * Merge two PATH strings, removing duplicates while preserving order.
 */
export function mergePaths(path1?: string, path2?: string): string {
  const separator = process.platform === 'win32' ? ';' : ':';
  const paths1 = path1?.split(separator).filter(Boolean) || [];
  const paths2 = path2?.split(separator).filter(Boolean) || [];

  const seen = new Set<string>();
  const merged: string[] = [];

  // Add paths from first source (process.env, typically from terminal)
  for (const p of paths1) {
    if (!seen.has(p)) {
      seen.add(p);
      merged.push(p);
    }
  }

  // Add paths from second source (shell env, for Finder/launchd launches)
  for (const p of paths2) {
    if (!seen.has(p)) {
      seen.add(p);
      merged.push(p);
    }
  }

  return merged.join(separator);
}

/**
 * Get enhanced environment variables by merging shell env with process.env.
 * For PATH, we merge both sources to ensure CLI tools are found regardless of
 * how the app was started (terminal vs Finder/launchd).
 *
 * This is the key function to use when spawning child processes that need
 * access to tools like npx, node, npm, etc.
 */
export function getEnhancedEnv(customEnv?: Record<string, string>): Record<string, string> {
  const shellEnv = loadShellEnvironment();

  // Merge PATH from both sources (shell env may miss nvm/fnm paths in dev mode)
  let mergedPath = mergePaths(process.env.PATH, shellEnv.PATH);
  if (process.platform === 'win32') {
    mergedPath = mergePaths(
      mergedPath,
      getWindowsSystemPathEntries({
        ...process.env,
        ...shellEnv,
        ...customEnv,
      }).join(';'),
    );
  }

  return {
    ...process.env,
    ...shellEnv,
    ...customEnv,
    // PATH must be set after spreading to ensure merged value is used
    PATH: customEnv?.PATH ? mergePaths(mergedPath, customEnv.PATH) : mergedPath,
  } as Record<string, string>;
}

/**
 * Clear the shell environment cache.
 * Useful for testing or when shell configuration changes.
 */
export function clearShellEnvCache(): void {
  cachedShellEnv = null;
}

// ── npx resolution ───────────────────────────────────────────────────────────

/**
 * Resolve the full path to `npx` by first locating the active `node` binary.
 * This is more reliable than hardcoded path lists because it follows the user's
 * actual Node.js installation (nvm, fnm, volta, Homebrew, etc.).
 *
 * @param env Environment to use for the `which` lookup.
 * @returns Absolute path to npx, or just 'npx' as a fallback.
 */
export function resolveNpxPath(env: Record<string, string | undefined>): string {
  const npxName = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  try {
    const whichCmd = process.platform === 'win32' ? 'where' : 'which';
    const nodePath = execFileSync(whichCmd, ['node'], {
      env: env as NodeJS.ProcessEnv,
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
      .trim()
      .split('\n')[0];

    const npxCandidate = path.join(path.dirname(nodePath), npxName);
    if (!existsSync(npxCandidate)) {
      console.warn(`[ShellEnv] npx not found next to node at ${npxCandidate}`);
      return npxName;
    }

    // Verify it's npm >= 7 (npx from npm 7+ supports --yes)
    const version = execFileSync(npxCandidate, ['--version'], {
      env: env as NodeJS.ProcessEnv,
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    if (parseInt(version.split('.')[0], 10) >= 7) {
      console.log(`[ShellEnv] Resolved npx via node → ${npxCandidate} (v${version})`);
      return npxCandidate;
    }
  } catch {
    // Fall through to bare name
  }
  return npxName;
}

export function resolveWindowsShellPath(
  env: Record<string, string | undefined> = {},
  platform: NodeJS.Platform = process.platform,
): string | null {
  if (platform !== 'win32') return null;

  const candidates = uniqueStrings([
    env.ComSpec,
    env.COMSPEC,
    process.env.ComSpec,
    process.env.COMSPEC,
    ...getWindowsRootCandidates(env).flatMap((root) => [
      path.join(root, 'System32', 'cmd.exe'),
      path.join(root, 'Sysnative', 'cmd.exe'),
    ]),
    ...(env.PATH ?? process.env.PATH ?? '')
      .split(';')
      .filter(Boolean)
      .map((dir) => path.join(dir, 'cmd.exe')),
  ]);

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  try {
    const output = execFileSync('where.exe', ['cmd.exe'], {
      env: {
        ...process.env,
        ...env,
        PATH: mergePaths(process.env.PATH, (env.PATH ?? '') || undefined),
      } as NodeJS.ProcessEnv,
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const resolved = uniqueStrings(output.split(/\r?\n/));
    for (const candidate of resolved) {
      if (existsSync(candidate)) {
        return candidate;
      }
    }
  } catch {
    // Ignore failures and let callers fall back to cmd.exe name lookup.
  }

  return null;
}

// ── Command resolution helpers ───────────────────────────────────────────────

/** Common paths where Node.js tools like npx are typically installed */
const COMMON_NPX_PATHS = [
  '/usr/local/bin/npx',
  '/opt/homebrew/bin/npx',
  '/usr/bin/npx',
  `${os.homedir()}/.nvm/versions/node/current/bin/npx`,
  `${os.homedir()}/.nvm/versions/node/default/bin/npx`,
  '/opt/local/bin/npx',
  `${os.homedir()}/.volta/bin/npx`,
  `${os.homedir()}/.asdf/shims/npx`,
  '/nix/var/nix/profiles/default/bin/npx',
];

/** Common paths for other CLI tools */
const COMMON_CLI_PATHS: Record<string, string[]> = {
  npx: COMMON_NPX_PATHS,
  node: COMMON_NPX_PATHS.map((p) => p.replace('/npx', '/node')),
  npm: COMMON_NPX_PATHS.map((p) => p.replace('/npx', '/npm')),
  claude: ['/usr/local/bin/claude', '/opt/homebrew/bin/claude'],
  codex: ['/usr/local/bin/codex', '/opt/homebrew/bin/codex'],
  gemini: ['/usr/local/bin/gemini', '/opt/homebrew/bin/gemini'],
  qwen: ['/usr/local/bin/qwen', '/opt/homebrew/bin/qwen'],
  goose: ['/usr/local/bin/goose', '/opt/homebrew/bin/goose'],
};

/**
 * Try to find a command in common installation locations.
 * Used as a fallback when PATH-based lookup fails.
 */
function findInCommonPaths(cmd: string): string | null {
  const paths = COMMON_CLI_PATHS[cmd];
  if (paths) {
    for (const p of paths) {
      if (existsSync(p)) {
        return p;
      }
    }
  }
  return null;
}

/**
 * Try to resolve a command path using the shell's `which` command.
 * This runs the shell with the enhanced environment to find the command.
 */
function resolveViaShell(cmd: string, env: Record<string, string>): string | null {
  if (process.platform === 'win32') {
    return null;
  }

  try {
    const shell = process.env.SHELL || '/bin/zsh';
    const whichCmd = process.platform === 'win32' ? 'where' : 'which';
    const output = execSync(`${shell} -ilc '${whichCmd} ${cmd}'`, {
      encoding: 'utf-8',
      timeout: 5000,
      env: { ...env, HOME: os.homedir() },
    });
    const resolved = output.trim().split('\n')[0];
    if (resolved && existsSync(resolved)) {
      return resolved;
    }
  } catch {
    // Ignore errors - command not found
  }
  return null;
}

/**
 * Resolve a command to its full path.
 * First tries the enhanced PATH, then falls back to common locations and shell lookup.
 *
 * @param cmd The command to resolve (e.g., 'npx', 'node')
 * @param customEnv Optional custom environment to use for resolution
 * @returns The full path to the command, or the original command if not found
 */
export function resolveCommandPath(cmd: string, customEnv?: Record<string, string>): string {
  // If it's already an absolute path, return as-is
  if (path.isAbsolute(cmd)) {
    return cmd;
  }

  // Get enhanced environment
  const env = customEnv ?? getEnhancedEnv();
  const pathSeparator = process.platform === 'win32' ? ';' : ':';
  const pathDirs = env.PATH?.split(pathSeparator) ?? [];

  // Try to find in PATH
  for (const dir of pathDirs) {
    const fullPath = path.join(dir, cmd);
    if (process.platform === 'win32' && !path.extname(cmd)) {
      for (const extension of ['.exe', '.cmd', '.bat', '.com']) {
        const candidate = `${fullPath}${extension}`;
        if (existsSync(candidate)) {
          return candidate;
        }
      }
    }
    if (existsSync(fullPath)) {
      return fullPath;
    }
  }

  // Fall back to common installation paths
  const commonPath = findInCommonPaths(cmd);
  if (commonPath) {
    console.log(`[ShellEnv] Resolved ${cmd} to common path: ${commonPath}`);
    return commonPath;
  }

  // Last resort: try to resolve via shell which command
  const shellPath = resolveViaShell(cmd, env);
  if (shellPath) {
    console.log(`[ShellEnv] Resolved ${cmd} via shell: ${shellPath}`);
    return shellPath;
  }

  // Could not resolve - return original and let spawn fail with clear error
  console.warn(`[ShellEnv] Could not resolve ${cmd} in PATH or common locations`);
  return cmd;
}
