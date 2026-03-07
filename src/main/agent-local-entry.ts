import { startAgentLocalHttpServer } from './services/agent-local-server';

startAgentLocalHttpServer().catch((error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error('[agent-local-entry] failed to start:', message);
  process.exit(1);
});
