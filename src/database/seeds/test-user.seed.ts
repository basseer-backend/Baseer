import { DataSource } from 'typeorm';
import { User } from '../entities/user.entity';

export const DEFAULT_TEST_USER_ID = '11111111-1111-1111-1111-111111111111';

export async function seedTestUser(dataSource: DataSource): Promise<{ user: User; isNew: boolean }> {
  const userRepo = dataSource.getRepository(User);
  const existing = await userRepo.findOne({ where: { id: DEFAULT_TEST_USER_ID } });

  if (existing) {
    return { user: existing, isNew: false };
  }

  const user = userRepo.create({
    id: DEFAULT_TEST_USER_ID,
    isGuest: false,
    preferredLanguage: 'ar-EG',
  });

  const saved = await userRepo.save(user);
  return { user: saved, isNew: true };
}
