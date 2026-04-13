/**
 * next-auth calls `new URL(process.env.NEXTAUTH_URL)` during assertConfig.
 * An empty string (common when .env has `NEXTAUTH_URL=` with no value) throws ERR_INVALID_URL
 * and yields 500 + empty body on `/api/auth/session`.
 */
for (const key of ['NEXTAUTH_URL', 'AUTH_URL'] as const) {
  const v = process.env[key]
  if (v !== undefined && !String(v).trim()) {
    delete process.env[key]
  }
}
