import dataSource from '../data-source';
import { seedAiModels } from './ai-models.seed';
import { seedTestUser, DEFAULT_TEST_USER_ID } from './test-user.seed';

export async function runAllSeeds() {
  console.log('Initializing database data source...');
  await dataSource.initialize();

  try {
    console.log('Seeding default test user for API testing...');
    const userResult = await seedTestUser(dataSource);
    console.log(
      `Test User (${DEFAULT_TEST_USER_ID}): ${userResult.isNew ? 'created' : 'already exists'}.`,
    );

    console.log('Seeding Baseer planned AI models...');
    const result = await seedAiModels(dataSource);
    console.log(
      `AI Models Seed completed: ${result.seeded} seeded, ${result.updated} updated.`,
    );
  } finally {
    await dataSource.destroy();
  }
}

if (require.main === module) {
  runAllSeeds().catch((err) => {
    console.error('Seed execution failed:', err);
    process.exit(1);
  });
}
