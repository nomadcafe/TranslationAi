import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/auth'
import { getUserIdAndStripePriceId } from './quota'

export async function requireAuth(): Promise<{
  userId: number
  email: string
} | null> {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return null
  const user = await getUserIdAndStripePriceId(session.user.email)
  if (!user) return null
  return { userId: user.id, email: session.user.email }
}
