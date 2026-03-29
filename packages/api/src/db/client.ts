import { Pool } from 'pg';

let pool: Pool;

export function getDb(): Pool {
  if (!pool) throw new Error('Database not initialized. Call initDb() first.');
  return pool;
}

export async function initDb(): Promise<void> {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('localhost')
      ? false
      : { rejectUnauthorized: false },
  });

  // Test connection
  const client = await pool.connect();
  client.release();
  console.log('Database connected');

  await runMigrations(pool);
}

async function runMigrations(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS api_keys (
        id TEXT PRIMARY KEY,
        key_hash TEXT NOT NULL UNIQUE,
        account_id TEXT NOT NULL,
        name TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_used_at TIMESTAMPTZ,
        revoked_at TIMESTAMPTZ
      );

      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY,
        phone_number_id TEXT NOT NULL,
        waba_id TEXT NOT NULL,
        access_token_encrypted TEXT NOT NULL,
        webhook_url TEXT,
        webhook_verify_token TEXT NOT NULL DEFAULT 'whatagent_verify_2024',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES accounts(id),
        direction TEXT NOT NULL CHECK (direction IN ('outbound', 'inbound')),
        to_number TEXT,
        from_number TEXT,
        type TEXT NOT NULL DEFAULT 'text',
        body TEXT,
        template_name TEXT,
        template_language TEXT,
        meta_message_id TEXT UNIQUE,
        status TEXT NOT NULL DEFAULT 'queued',
        error_code TEXT,
        error_message TEXT,
        sent_at TIMESTAMPTZ,
        delivered_at TIMESTAMPTZ,
        read_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_messages_account_id ON messages(account_id);
      CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_messages_meta_message_id ON messages(meta_message_id);
    `);
    console.log('Database migrations applied');
  } finally {
    client.release();
  }
}
