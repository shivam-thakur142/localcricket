// ====================================================================
// SECURE SUPER ADMIN CLI PROVISIONING UTILITY (server/src/provisionAdmin.js)
// ====================================================================

import crypto from 'crypto';
import readline from 'readline';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'url';
import { createDbPool, withTransaction } from './db.js';

const PASSWORD_POLICY_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/;

export function validateAdminPassword(password) {
  if (!password || typeof password !== 'string') {
    return 'Password is required';
  }
  if (password.length < 8) {
    return 'Password must be at least 8 characters long';
  }
  if (!PASSWORD_POLICY_REGEX.test(password)) {
    return 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character';
  }
  return null;
}

/**
 * Programmatically provisions a new Super Admin account with full validation and audit logging.
 */
export async function provisionSuperAdmin(poolOrDb, { email, password, fullName = 'Platform Administrator' }) {
  if (!email || !email.includes('@')) {
    throw new Error('A valid email address is required');
  }

  const normalizedEmail = email.toLowerCase().trim();
  const passwordError = validateAdminPassword(password);
  if (passwordError) {
    throw new Error(`Password policy violation: ${passwordError}`);
  }

  // Check if user already exists
  const existingRes = await poolOrDb.query(
    'SELECT id, global_role FROM users WHERE email = $1;',
    [normalizedEmail]
  );

  if (existingRes.rows.length > 0) {
    throw new Error(`User with email "${normalizedEmail}" already exists`);
  }

  // Hash password with bcrypt cost 12
  const passwordHash = await bcrypt.hash(password, 12);
  const newUserId = crypto.randomUUID();

  return await withTransaction(poolOrDb, async (client) => {
    // 1. Insert into auth.users stub
    await client.query(
      'INSERT INTO auth.users (id, email) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING;',
      [newUserId, normalizedEmail]
    );

    // 2. Insert user with global_role = 'SUPER_ADMIN'
    const insertRes = await client.query(
      `INSERT INTO users (
        id, auth_user_id, email, full_name, global_role, is_suspended, created_at, updated_at
      ) VALUES ($1, $1, $2, $3, 'SUPER_ADMIN', FALSE, NOW(), NOW())
      RETURNING id, email, full_name, global_role, created_at;`,
      [newUserId, normalizedEmail, fullName]
    );

    const user = insertRes.rows[0];

    // 2. Insert password hash in user_credentials
    await client.query(
      `INSERT INTO user_credentials (
        user_id, password_hash, password_updated_at, created_at
      ) VALUES ($1, $2, NOW(), NOW());`,
      [user.id, passwordHash]
    );

    // 2. Insert audit log record in platform_audit_logs
    await client.query(
      `INSERT INTO platform_audit_logs (
        id, admin_user_id, action, target_entity_type, target_entity_id, reason, created_at
      ) VALUES ($1, $2, 'PROVISION_SUPER_ADMIN', 'USER', $3, $4, NOW());`,
      [
        crypto.randomUUID(),
        user.id,
        user.id,
        'Initial Super Admin account provisioned via secure CLI utility',
      ]
    );

    return user;
  });
}

// CLI interactive execution
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  (async () => {
    const pool = createDbPool();
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const question = (query) => new Promise((resolve) => rl.question(query, resolve));

    try {
      console.log('\n🏏 ======================================================================');
      console.log('🏏 LocalCricket: Secure Super Admin CLI Provisioning');
      console.log('🏏 ======================================================================\n');

      const email = await question('Enter Super Admin Email: ');
      const fullName = (await question('Enter Full Name (default: Platform Administrator): ')) || 'Platform Administrator';

      // Prompt for password
      const password = await question('Enter Strong Password: ');

      rl.close();

      console.log('\nProvisioning Super Admin account with bcrypt (cost 12)...');
      const user = await provisionSuperAdmin(pool, { email, password, fullName });

      console.log('✅ Super Admin provisioned successfully:');
      console.log(`   User ID:     ${user.id}`);
      console.log(`   Email:       ${user.email}`);
      console.log(`   Role:        ${user.global_role}`);
      console.log(`   Created At:  ${user.created_at}`);
      console.log('\nAudit event recorded in platform_audit_logs.\n');

      await pool.end();
      process.exit(0);
    } catch (err) {
      rl.close();
      console.error('\n❌ Provisioning failed:', err.message);
      await pool.end();
      process.exit(1);
    }
  })();
}
