import { neon } from '@neondatabase/serverless'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const sql = neon(process.env.NEW_DATABASE_URL || process.env.DATABASE_URL!)

async function migrate() {
  try {
    // Enable uuid-ossp for UUID helpers.
    await sql`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`
    console.log('Enabled uuid-ossp extension')

    // Drop tables (destructive migration).
    await sql`DROP TABLE IF EXISTS usage_records`
    await sql`DROP TABLE IF EXISTS payment_history`
    await sql`DROP TABLE IF EXISTS auth_users`
    console.log('Dropped existing tables')

    // auth_users
    await sql`
      CREATE TABLE auth_users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        password_hash VARCHAR(255),
        name VARCHAR(255),
        github_id VARCHAR(255) UNIQUE,
        google_id VARCHAR(255) UNIQUE,
        stripe_customer_id VARCHAR(255) UNIQUE,
        stripe_subscription_id VARCHAR(255) UNIQUE,
        stripe_price_id VARCHAR(255),
        stripe_current_period_end TIMESTAMP WITH TIME ZONE,
        text_quota INTEGER DEFAULT -1,
        image_quota INTEGER DEFAULT 5,
        pdf_quota INTEGER DEFAULT 3,
        speech_quota INTEGER DEFAULT 2,
        video_quota INTEGER DEFAULT 1,
        quota_reset_at DATE DEFAULT CURRENT_DATE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `
    console.log('Created auth_users table')

    // usage_records
    await sql`
      CREATE TABLE usage_records (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES auth_users(id),
        type VARCHAR(20) NOT NULL,
        used_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE
      )
    `
    console.log('Created usage_records table')

    // payment_history
    await sql`
      CREATE TABLE payment_history (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES auth_users(id),
        stripe_invoice_id VARCHAR(255) UNIQUE,
        amount INTEGER NOT NULL,
        status VARCHAR(50) NOT NULL,
        payment_date TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE
      )
    `
    console.log('Created payment_history table')

    console.log('Migration completed successfully')
  } catch (error) {
    console.error('Migration failed:', error)
    process.exit(1)
  }
}

migrate() 