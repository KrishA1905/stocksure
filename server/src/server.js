const env = require('./config/env');
const prisma = require('./config/prisma');
const { createApp } = require('./app');

async function main() {
  await prisma.$connect();
  const app = createApp();
  const server = app.listen(env.PORT, () => {
    console.log(`StockSure API listening on http://localhost:${env.PORT}/api (${env.NODE_ENV})`);
  });

  const shutdown = async (signal) => {
    console.log(`${signal} received, shutting down...`);
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch(async (err) => {
  console.error('Failed to start server:', err.message);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
