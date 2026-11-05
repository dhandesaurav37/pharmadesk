import { createApp } from './app';
import { env, validateEnv } from './config/env';
import { logger } from './lib/logger';
import http from 'node:http';

/**
 * Initializes and starts the HTTP server.
 * Handles graceful shutdown on SIGTERM and SIGINT.
 */
export async function startServer(): Promise<http.Server> {
  try {
    // 1. Validate environment configuration at boot time
    const config = validateEnv();

    logger.info(
      {
        nodeEnv: config.NODE_ENV,
        port: config.PORT,
        host: config.HOST,
        apiPrefix: config.API_PREFIX,
        logLevel: config.LOG_LEVEL,
      },
      'Starting PharmaDesk backend server...'
    );

    // 2. Instantiate Express application
    const app = createApp({ config });

    // 3. Create HTTP server instance
    const server = http.createServer(app);

    // 4. Start listening on configured host and port
    server.listen(config.PORT, config.HOST, () => {
      logger.info(
        `PharmaDesk API running at http://${config.HOST}:${config.PORT}${config.API_PREFIX}`
      );
      logger.info(
        `Health checks: http://${config.HOST}:${config.PORT}${config.API_PREFIX}/health/live`
      );
    });

    // 5. Graceful shutdown handler
    const handleShutdown = (signal: string) => {
      logger.info(`Received ${signal}. Initiating graceful server shutdown...`);

      // Set a 10-second timeout for in-flight requests to complete
      const forceShutdownTimeout = setTimeout(() => {
        logger.error('Graceful shutdown timed out after 10s. Forcing exit.');
        process.exit(1);
      }, 10000);

      server.close((err) => {
        clearTimeout(forceShutdownTimeout);
        if (err) {
          logger.error({ err }, 'Error occurred during server close.');
          process.exit(1);
        }
        logger.info('HTTP server closed successfully. Process exiting.');
        process.exit(0);
      });
    };

    // Register process signal handlers
    process.on('SIGTERM', () => handleShutdown('SIGTERM'));
    process.on('SIGINT', () => handleShutdown('SIGINT'));

    // Process-level exception traps
    process.on('uncaughtException', (err: Error) => {
      logger.fatal({ err }, 'Fatal: Uncaught exception in server process');
      process.exit(1);
    });

    process.on('unhandledRejection', (reason: unknown) => {
      logger.fatal({ reason }, 'Fatal: Unhandled promise rejection in server process');
      process.exit(1);
    });

    return server;
  } catch (error: any) {
    logger.fatal({ err: error?.message || error }, 'Failed to start PharmaDesk backend server');
    process.exit(1);
  }
}

// Execute startup when invoked directly
if (process.env.NODE_ENV !== 'test') {
  startServer();
}

export default startServer;
