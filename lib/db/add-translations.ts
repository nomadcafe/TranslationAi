/**
 * Idempotent additive migrations. Safe to run repeatedly against a production
 * database that already has auth_users populated — only creates objects that are
 * missing and never drops or rewrites existing data. Run with:
 *   tsx lib/db/add-translations.ts
 */
import { neon } from '@neondatabase/serverless'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const sql = neon(process.env.DATABASE_URL!)

async function run() {
  await sql`
    CREATE TABLE IF NOT EXISTS translations (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      source_text TEXT NOT NULL,
      translated_text TEXT NOT NULL,
      source_language VARCHAR(64),
      target_language VARCHAR(64) NOT NULL,
      service VARCHAR(32),
      is_favorite BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS idx_translations_user_created ON translations(user_id, created_at DESC)`
  await sql`CREATE INDEX IF NOT EXISTS idx_translations_user_favorite ON translations(user_id, created_at DESC) WHERE is_favorite`
  console.log('translations table ready')

  // Index the hot quota-count queries (WHERE user_id = ? AND type = ? AND used_at ...).
  await sql`CREATE INDEX IF NOT EXISTS idx_usage_records_user_type_used ON usage_records(user_id, type, used_at)`
  console.log('usage_records index ready')

  // Stripe webhook idempotency ledger. The webhook no longer creates this on the
  // hot path, so it must exist before deploying. The ADD COLUMN backfills the
  // crash-safe `processed` flag for tables created by the old inline DDL.
  await sql`
    CREATE TABLE IF NOT EXISTS stripe_events (
      id VARCHAR(255) PRIMARY KEY,
      event_type VARCHAR(100),
      processed BOOLEAN NOT NULL DEFAULT FALSE,
      processed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `
  await sql`ALTER TABLE stripe_events ADD COLUMN IF NOT EXISTS processed BOOLEAN NOT NULL DEFAULT FALSE`
  console.log('stripe_events table ready')
}

run().catch((err) => {
  console.error('add-translations failed:', err)
  process.exit(1)
})
