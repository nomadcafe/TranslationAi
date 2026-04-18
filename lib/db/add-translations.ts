/**
 * Idempotent additive migration for the translations table.
 *
 * Safe to run against a production database that already has auth_users
 * populated. Does not drop or alter existing tables. Run with:
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
}

run().catch((err) => {
  console.error('add-translations failed:', err)
  process.exit(1)
})
