import { connectDB } from '../config/database.js';
import User from '../models/User.js';

export async function migrateUsersWithoutRole() {
  const filter = {
    $or: [
      { role: { $exists: false } },
      { role: null },
    ],
  };

  const update = {
    $set: { role: 'user' },
  };

  const result = await User.updateMany(filter, update);

  return {
    matchedCount: result.matchedCount,
    modifiedCount: result.modifiedCount,
  };
}

async function runMigration() {
  try {
    await connectDB();
    const result = await migrateUsersWithoutRole();

    console.log('Role migration completed');
    console.log(`Matched users: ${result.matchedCount}`);
    console.log(`Updated users: ${result.modifiedCount}`);

    process.exit(0);
  } catch (error) {
    console.error('Role migration failed:', error.message);
    process.exit(1);
  }
}

runMigration();
