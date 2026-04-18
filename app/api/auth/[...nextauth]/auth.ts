import '@/lib/server/nextauth-env'
import { AuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import GitHubProvider from 'next-auth/providers/github'
import GoogleProvider from 'next-auth/providers/google'
import { neon } from '@neondatabase/serverless'
import bcrypt from 'bcryptjs'
import { DEFAULT_PUBLIC_LOCALE } from '@/lib/i18n/app-locale'
import { FREE_QUOTA } from '@/lib/quota-plans'

const databaseUrl = process.env.DATABASE_URL?.trim()
const sql = databaseUrl ? neon(databaseUrl) : null

const providers: AuthOptions['providers'] = [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: "邮箱", type: "email" },
        password: { label: "密码", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Please enter email and password')
        }

        if (!sql) {
          console.error('NextAuth: DATABASE_URL is not set; credentials login unavailable.')
          throw new Error('Server is not configured for sign-in (missing DATABASE_URL)')
        }

        try {
          const result = await sql`
            SELECT id, email, name, password_hash FROM auth_users WHERE email = ${credentials.email}
          `
          const user = result[0]

          if (!user || !user.password_hash) {
            throw new Error('Invalid email or password')
          }

          const isValid = await bcrypt.compare(credentials.password, user.password_hash)
          if (!isValid) {
            throw new Error('Invalid email or password')
          }

          return {
            id: user.id,
            email: user.email,
            name: user.name || null,
          }
        } catch (error) {
          console.error('[auth] authorize error:', error instanceof Error ? error.message : error)
          throw new Error('Authentication server error, please try again later')
        }
      }
    }),
]

if (process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim()) {
  providers.push(
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      profile(profile) {
        return {
          id: profile.sub,
          name: profile.name,
          email: profile.email!,
          image: profile.picture,
        }
      },
    })
  )
}

if (process.env.GITHUB_ID?.trim() && process.env.GITHUB_SECRET?.trim()) {
  providers.push(
    GitHubProvider({
      clientId: process.env.GITHUB_ID!,
      clientSecret: process.env.GITHUB_SECRET!,
      httpOptions: {
        timeout: 10000
      },
      profile(profile) {
        return {
          id: String(profile.id),
          name: profile.name || profile.login,
          email: profile.email!,
          image: profile.avatar_url,
        }
      },
    })
  )
}

export const authOptions: AuthOptions = {
  debug: process.env.NODE_ENV === 'development',
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  providers,
  pages: {
    signIn: `/${DEFAULT_PUBLIC_LOCALE}/login`,
    error: `/${DEFAULT_PUBLIC_LOCALE}/login`,
  },
  callbacks: {
    async signIn({ user, account }) {
      if (!user.email) return false
      if (!sql) {
        console.error('[auth] signIn: DATABASE_URL is not set')
        return false
      }
      // Credentials logins are already validated in authorize().
      if (!account || account.provider === 'credentials') return true

      const provider = account.provider
      if (provider !== 'github' && provider !== 'google') return true
      const providerIdField = provider === 'github' ? 'github_id' : 'google_id'
      const incomingId = account.providerAccountId
      if (!incomingId) return false

      try {
        const existing = await sql`
          SELECT id, github_id, google_id FROM auth_users WHERE email = ${user.email}
        ` as { id: number; github_id: string | null; google_id: string | null }[]

        // First-time OAuth sign-in for this email – provision a fresh row.
        if (existing.length === 0) {
          if (provider === 'github') {
            await sql`
              INSERT INTO auth_users (email, name, github_id, text_quota, image_quota, pdf_quota, speech_quota, video_quota)
              VALUES (${user.email}, ${user.name}, ${incomingId},
                      ${FREE_QUOTA.text_quota}, ${FREE_QUOTA.image_quota}, ${FREE_QUOTA.pdf_quota},
                      ${FREE_QUOTA.speech_quota}, ${FREE_QUOTA.video_quota})
            `
          } else {
            await sql`
              INSERT INTO auth_users (email, name, google_id, text_quota, image_quota, pdf_quota, speech_quota, video_quota)
              VALUES (${user.email}, ${user.name}, ${incomingId},
                      ${FREE_QUOTA.text_quota}, ${FREE_QUOTA.image_quota}, ${FREE_QUOTA.pdf_quota},
                      ${FREE_QUOTA.speech_quota}, ${FREE_QUOTA.video_quota})
            `
          }
          return true
        }

        // Row already exists – enforce strict linkage to avoid cross-provider account takeover.
        const row = existing[0]
        const currentProviderId = provider === 'github' ? row.github_id : row.google_id

        if (currentProviderId === incomingId) {
          // Returning OAuth user – OK.
          return true
        }

        if (currentProviderId !== null) {
          // A different OAuth identity is already bound to this email.
          console.warn(`[auth] Rejected ${provider} sign-in: email already linked to a different ${providerIdField}`)
          return false
        }

        // No OAuth id yet for this provider – first-time linking to an existing row.
        if (provider === 'github') {
          await sql`UPDATE auth_users SET github_id = ${incomingId}, updated_at = CURRENT_TIMESTAMP WHERE id = ${row.id}`
        } else {
          await sql`UPDATE auth_users SET google_id = ${incomingId}, updated_at = CURRENT_TIMESTAMP WHERE id = ${row.id}`
        }
        return true
      } catch (error) {
        console.error('[auth] signIn callback error:', error instanceof Error ? error.message : error)
        return false
      }
    },
    async jwt({ token, user }) {
      // Persist the DB id on the token so the session callback does not need a lookup.
      if (user) token.id = user.id
      if (!token.id && token.email && sql) {
        try {
          const rows = await sql`SELECT id FROM auth_users WHERE email = ${token.email}` as { id: number }[]
          if (rows.length > 0) token.id = rows[0].id
        } catch (e) {
          console.error('[auth] jwt callback DB error:', e instanceof Error ? e.message : e)
        }
      }
      return token
    },
    async session({ session, token }) {
      // Read id straight from the JWT – no DB round-trip per request.
      if (session.user && token.id) {
        session.user.id = token.id as number
      }
      return session
    },
  },
}
