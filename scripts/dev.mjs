#!/usr/bin/env node
/**
 * Unified dev script: builds main process, starts Vite, and launches Electron.
 *
 * Usage: pnpm run dev
 */

import { spawn } from 'child_process';
import { setTimeout as sleep } from 'timers/promises';

let electronProcess = null;
let viteProcess = null;
let isShuttingDown = false;

const isWindows = process.platform === 'win32';

function log(prefix, message) {
  const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
  console.log(`[${timestamp}] [${prefix}] ${message}`);
}

function shutdown() {
  if (isShuttingDown) return;
  isShuttingDown = true;

  log('dev', 'Shutting down...');

  // Kill child processes with SIGTERM first, then SIGKILL if needed
  const killProcess = (proc, name) => {
    if (!proc || proc.killed) return;

    try {
      // Try graceful shutdown first
      proc.kill('SIGTERM');

      // Force kill after 2 seconds if still running
      setTimeout(() => {
        if (proc && !proc.killed) {
          log('dev', `Force killing ${name}...`);
          proc.kill('SIGKILL');
        }
      }, 2000);
    } catch (err) {
      log('dev', `Error killing ${name}: ${err.message}`);
    }
  };

  killProcess(electronProcess, 'electron');
  killProcess(viteProcess, 'vite');

  electronProcess = null;
  viteProcess = null;

  // Exit after a short delay to allow cleanup
  setTimeout(() => {
    process.exit(0);
  }, 2500);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
if (isWindows) {
  process.on('SIGBREAK', shutdown);
}

async function runCommand(command, args, label, options = {}) {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    stdio: 'pipe',
    shell: isWindows,
    // Ensure child processes are killed when parent exits
    detached: false,
  });

  child.stdout?.on('data', (data) => {
    const lines = data.toString().trim().split('\n');
    for (const line of lines) {
      if (line) log(label, line);
    }
  });

  child.stderr?.on('data', (data) => {
    const lines = data.toString().trim().split('\n');
    for (const line of lines) {
      if (line) log(label, line);
    }
  });

  child.on('close', (code) => {
    if (!isShuttingDown) {
      log(label, `Process exited with code ${code}`);
      if (label === 'electron' && code === 0) {
        shutdown();
      }
    }
  });

  // Handle errors
  child.on('error', (err) => {
    if (!isShuttingDown) {
      log(label, `Process error: ${err.message}`);
    }
  });

  return child;
}

async function waitForVite(url, maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(url);
      if (response.ok) return true;
    } catch {
      // Vite not ready yet
    }
    await sleep(500);
  }
  return false;
}

async function main() {
  log('dev', 'Starting development environment...');

  // 1. Build main process (initial build)
  log('dev', 'Building main process...');
  const buildMain = spawn('node', ['scripts/build-main.mjs'], {
    stdio: 'inherit',
    shell: isWindows,
  });
  await new Promise((resolve) => {
    buildMain.on('close', (code) => {
      if (code === 0) {
        log('dev', 'Main process build complete');
        resolve();
      } else {
        log('dev', `Main process build failed with code ${code}`);
        process.exit(1);
      }
    });
  });

  // 2. Start Vite dev server
  log('dev', 'Starting Vite dev server...');
  viteProcess = await runCommand('vite', [], 'vite');

  // 3. Wait for Vite to be ready
  const viteUrl = 'http://localhost:5173';
  log('dev', `Waiting for Vite at ${viteUrl}...`);
  const viteReady = await waitForVite(viteUrl);
  if (!viteReady) {
    log('dev', 'Vite failed to start');
    shutdown();
    return;
  }
  log('dev', 'Vite is ready');

  // 4. Launch Electron
  log('dev', 'Launching Electron...');
  electronProcess = await runCommand('electron', ['.'], 'electron', {
    env: { ELECTRON_DEV: '1' },
  });

  log('dev', 'Development environment ready! Press Ctrl+C to stop.');
}

main().catch((err) => {
  console.error(err);
  shutdown();
});
