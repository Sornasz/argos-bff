import { createBffApp } from './bootstrap/app.js';
import { readBffConfig } from './bootstrap/config.js';

const config = readBffConfig(process.env);
const app = createBffApp(config);

const server = app.listen(config.port, () => {
  console.info(
    JSON.stringify({
      event: 'bff_started',
      port: config.port,
      upstreamTimeoutMs: config.upstreamTimeoutMs,
      cors: config.corsOrigins.length > 0 ? 'enabled' : 'disabled',
      functionKey: config.functionKey === null ? 'not_set' : 'set',
    }),
  );
});

function shutdown(signal: string): void {
  console.info(JSON.stringify({ event: 'bff_stopping', signal }));
  server.close(() => process.exit(0));
  server.closeIdleConnections();
}

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));
