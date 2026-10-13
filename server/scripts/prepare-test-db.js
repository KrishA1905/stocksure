/* Resets the TEST database (DATABASE_URL_TEST) before `npm test`:
 * drops everything, applies all migrations and runs the seed.
 * Refuses to run against the development database.
 */
require('dotenv').config();
const { execSync } = require('child_process');

const testUrl = process.env.DATABASE_URL_TEST;
if (!testUrl) {
  console.error('DATABASE_URL_TEST is not set in server/.env - refusing to run tests against the dev database.');
  process.exit(1);
}
if (testUrl === process.env.DATABASE_URL) {
  console.error('DATABASE_URL_TEST must point to a different database than DATABASE_URL.');
  process.exit(1);
}

execSync('npx prisma migrate reset --force --skip-generate', {
  stdio: ['ignore', 'ignore', 'inherit'],
  env: { ...process.env, DATABASE_URL: testUrl },
});
console.log('Test database reset and seeded.');
