import { neon } from '@neondatabase/serverless'

// Hard cap on what we'll persist. Source/target can be long — we store the full
// text so favorites stay meaningful, but reject anything suspicious to keep
// rows bounded. These are floors on top of the per-route validation caps.
const MAX_SOURCE_CHARS = 50_000
const MAX_TRANSLATED_CHARS = 100_000

let _sql: ReturnType<typeof neon> | null = null
function getSql() {
  if (!_sql) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL is not set')
    _sql = neon(url)
  }
  return _sql
}

export interface TranslationRow {
  id: number
  source_text: string
  translated_text: string
  source_language: string | null
  target_language: string
  service: string | null
  is_favorite: boolean
  created_at: string
}

export interface SaveTranslationInput {
  userId: number
  sourceText: string
  translatedText: string
  targetLanguage: string
  sourceLanguage?: string | null
  service?: string | null
}

/**
 * Persist a translation. Runs best-effort: failures are logged and swallowed so
 * that a transient DB blip does not turn into a user-visible translate error.
 * Callers should fire-and-forget after returning the translation to the client.
 */
export async function saveTranslation(input: SaveTranslationInput): Promise<void> {
  const sourceText = (input.sourceText ?? '').slice(0, MAX_SOURCE_CHARS)
  const translatedText = (input.translatedText ?? '').slice(0, MAX_TRANSLATED_CHARS)
  if (!sourceText || !translatedText) return

  try {
    await getSql()`
      INSERT INTO translations (
        user_id, source_text, translated_text,
        source_language, target_language, service
      ) VALUES (
        ${input.userId}, ${sourceText}, ${translatedText},
        ${input.sourceLanguage ?? null}, ${input.targetLanguage}, ${input.service ?? null}
      )
    `
  } catch (err) {
    console.error('[translations] save failed:', err instanceof Error ? err.message : err)
  }
}

export interface ListOptions {
  userId: number
  search?: string
  favoriteOnly?: boolean
  /** Opaque cursor: last row's id. Returns rows strictly older than this. */
  beforeId?: number
  limit?: number
}

export interface ListResult {
  items: TranslationRow[]
  nextCursor: number | null
}

export async function listTranslations(opts: ListOptions): Promise<ListResult> {
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 50)
  const search = opts.search?.trim() ?? ''
  const pattern = search ? `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null
  const beforeId = opts.beforeId && opts.beforeId > 0 ? opts.beforeId : null

  // Fetch one extra row to detect whether a next page exists without a count(*).
  const fetchLimit = limit + 1
  const sql = getSql()

  // Build with conditional WHERE clauses. Keeping each branch explicit avoids
  // dynamic SQL interpolation inside the tagged template (which would turn
  // parameters into literals).
  let rows: TranslationRow[]
  if (pattern && opts.favoriteOnly && beforeId) {
    rows = (await sql`
      SELECT id, source_text, translated_text, source_language, target_language, service, is_favorite, created_at
      FROM translations
      WHERE user_id = ${opts.userId}
        AND is_favorite = TRUE
        AND id < ${beforeId}
        AND (source_text ILIKE ${pattern} OR translated_text ILIKE ${pattern})
      ORDER BY id DESC
      LIMIT ${fetchLimit}
    `) as TranslationRow[]
  } else if (pattern && opts.favoriteOnly) {
    rows = (await sql`
      SELECT id, source_text, translated_text, source_language, target_language, service, is_favorite, created_at
      FROM translations
      WHERE user_id = ${opts.userId}
        AND is_favorite = TRUE
        AND (source_text ILIKE ${pattern} OR translated_text ILIKE ${pattern})
      ORDER BY id DESC
      LIMIT ${fetchLimit}
    `) as TranslationRow[]
  } else if (pattern && beforeId) {
    rows = (await sql`
      SELECT id, source_text, translated_text, source_language, target_language, service, is_favorite, created_at
      FROM translations
      WHERE user_id = ${opts.userId}
        AND id < ${beforeId}
        AND (source_text ILIKE ${pattern} OR translated_text ILIKE ${pattern})
      ORDER BY id DESC
      LIMIT ${fetchLimit}
    `) as TranslationRow[]
  } else if (pattern) {
    rows = (await sql`
      SELECT id, source_text, translated_text, source_language, target_language, service, is_favorite, created_at
      FROM translations
      WHERE user_id = ${opts.userId}
        AND (source_text ILIKE ${pattern} OR translated_text ILIKE ${pattern})
      ORDER BY id DESC
      LIMIT ${fetchLimit}
    `) as TranslationRow[]
  } else if (opts.favoriteOnly && beforeId) {
    rows = (await sql`
      SELECT id, source_text, translated_text, source_language, target_language, service, is_favorite, created_at
      FROM translations
      WHERE user_id = ${opts.userId} AND is_favorite = TRUE AND id < ${beforeId}
      ORDER BY id DESC
      LIMIT ${fetchLimit}
    `) as TranslationRow[]
  } else if (opts.favoriteOnly) {
    rows = (await sql`
      SELECT id, source_text, translated_text, source_language, target_language, service, is_favorite, created_at
      FROM translations
      WHERE user_id = ${opts.userId} AND is_favorite = TRUE
      ORDER BY id DESC
      LIMIT ${fetchLimit}
    `) as TranslationRow[]
  } else if (beforeId) {
    rows = (await sql`
      SELECT id, source_text, translated_text, source_language, target_language, service, is_favorite, created_at
      FROM translations
      WHERE user_id = ${opts.userId} AND id < ${beforeId}
      ORDER BY id DESC
      LIMIT ${fetchLimit}
    `) as TranslationRow[]
  } else {
    rows = (await sql`
      SELECT id, source_text, translated_text, source_language, target_language, service, is_favorite, created_at
      FROM translations
      WHERE user_id = ${opts.userId}
      ORDER BY id DESC
      LIMIT ${fetchLimit}
    `) as TranslationRow[]
  }

  const hasMore = rows.length > limit
  const items = hasMore ? rows.slice(0, limit) : rows
  const nextCursor = hasMore ? items[items.length - 1].id : null
  return { items, nextCursor }
}

export async function setFavorite(userId: number, id: number, isFavorite: boolean): Promise<boolean> {
  const rows = (await getSql()`
    UPDATE translations SET is_favorite = ${isFavorite}
    WHERE id = ${id} AND user_id = ${userId}
    RETURNING id
  `) as { id: number }[]
  return rows.length > 0
}

export async function removeTranslation(userId: number, id: number): Promise<boolean> {
  const rows = (await getSql()`
    DELETE FROM translations
    WHERE id = ${id} AND user_id = ${userId}
    RETURNING id
  `) as { id: number }[]
  return rows.length > 0
}
