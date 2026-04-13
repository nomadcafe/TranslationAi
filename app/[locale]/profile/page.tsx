"use client";

import { useEffect, useState } from "react"
import { useSession, signIn } from "next-auth/react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useLoginHref } from "@/lib/i18n/marketing-href"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useI18n } from "@/lib/i18n/use-translations"
import { useLanguage } from "@/components/language-provider"
import { Progress } from "@/components/ui/progress"
import { toast } from 'sonner'
import confetti from 'canvas-confetti'
import { PLANS } from '@/lib/stripe'
import { apiFetch } from '@/lib/api-fetch'
import { Badge } from '@/components/ui/badge'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Pencil } from "lucide-react"

interface UserInfo {
  user: {
    id: string;
    email: string;
    name: string | null;
    created_at: string;
    updated_at: string;
  };
  subscription: {
    stripe_customer_id: string | null;
    stripe_subscription_id: string | null;
    stripe_price_id: string | null;
    stripe_current_period_end: string | null;
  };
  quota: {
    text_quota: number;
    image_quota: number;
    pdf_quota: number;
    speech_quota: number;
    video_quota: number;
  };
  usage: {
    text: number;
    image: number;
    pdf: number;
    speech: number;
    video: number;
  };
}

const QUOTA_TYPES = ['text', 'image', 'pdf', 'speech', 'video'] as const

export default function ProfilePage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const pathname = usePathname()
  const loginHref = useLoginHref()
  const { t } = useI18n()
  const { language } = useLanguage()
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null)
  const searchParams = useSearchParams()
  const [isEditingName, setIsEditingName] = useState(false)
  const [newName, setNewName] = useState('')
  const [isUpdating, setIsUpdating] = useState(false)

  // Fetch /api/user/info for the signed-in user.
  const fetchUserInfo = async () => {
    try {
      console.log('开始获取用户信息')
      const response = await apiFetch('/api/user/info')
      const data = await response.json()
      if (response.ok) {
        console.log('获取到的用户信息:', {
          id: data.user.id,
          email: data.user.email,
          subscription: {
            customerId: data.subscription.stripe_customer_id,
            subscriptionId: data.subscription.stripe_subscription_id,
            priceId: data.subscription.stripe_price_id,
            currentPeriodEnd: data.subscription.stripe_current_period_end
          },
          quota: data.quota,
          usage: data.usage
        })
        setUserInfo(data)
      } else {
        console.error('获取用户信息失败:', data.error)
      }
    } catch (error) {
      console.error('获取用户信息失败:', error)
    }
  }

  useEffect(() => {
    // Known unauthenticated: send to sign-in.
    if (status === 'unauthenticated') {
      console.log('用户未登录，重定向到登录页面')
      router.push(`${loginHref}?callbackUrl=${encodeURIComponent(pathname)}`)
      return
    }

    // Session present: load profile once.
    if (status === 'authenticated') {
      console.log('用户已登录，获取用户信息')
      // Initial load only (avoid refetch loops).
      fetchUserInfo()
    }
  }, [status, router, t, pathname, loginHref])

  // Confetti when returning from Stripe checkout.
  useEffect(() => {
    if (userInfo && searchParams.get('subscription') === 'success') {
      console.log('用户信息加载完成，检测到订阅成功参数，显示成功提示')
      toast.success(t('auth.profile.subscription.success'))
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
      })
      
      // Strip ?subscription=success to prevent repeat celebration on refresh.
      const newUrl = new URL(window.location.href)
      newUrl.searchParams.delete('subscription')
      router.replace(newUrl.pathname + newUrl.search)
    }
  }, [userInfo, searchParams, t, router])

  // Session still resolving.
  if (status === 'loading') {
    return (
      <div className="container py-20">
        <div className="flex items-center justify-center min-h-[200px]">
          <div className="text-muted-foreground">Loading...</div>
        </div>
      </div>
    )
  }

  // Signed out: render nothing while redirecting.
  if (!session) return null

  // Authenticated but profile not loaded yet.
  if (!userInfo) {
    return (
      <div className="container py-20">
        <div className="flex items-center justify-center min-h-[200px]">
          <div className="text-muted-foreground">Loading...</div>
        </div>
      </div>
    )
  }

  // PATCH display name
  const updateName = async () => {
    if (!newName.trim()) {
      toast.error(t('auth.profile.basicInfo.editUsername.error.empty'))
      return
    }

    try {
      setIsUpdating(true)
      const response = await apiFetch('/api/user/update', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: newName.trim() }),
      })

      if (response.ok) {
        toast.success(t('auth.profile.basicInfo.editUsername.success'))
        setIsEditingName(false)
        fetchUserInfo()
      } else {
        const data = await response.json()
        toast.error(data.message || data.error || t('auth.profile.basicInfo.editUsername.error.failed'))
      }
    } catch (error) {
      console.error('更新用户名失败:', error)
      toast.error(t('auth.profile.basicInfo.editUsername.error.failed'))
    } finally {
      setIsUpdating(false)
    }
  }

  const renderQuotaItem = (type: typeof QUOTA_TYPES[number]) => {
    const quota = userInfo.quota[`${type}_quota` as keyof typeof userInfo.quota]
    const used = userInfo.usage[type]
    const percentage = quota === -1 ? 0 : (used / quota) * 100

    return (
      <div className="p-4 bg-muted rounded-lg">
        <div className="text-sm text-muted-foreground mb-1">
          {t(`auth.profile.subscription.quota.${type}`)}
        </div>
        <div className="text-2xl font-semibold mb-2">
          {quota === -1 ? 
            t('auth.profile.subscription.quota.unlimited') : 
            t('auth.profile.subscription.quota.usage', { used: used.toString(), quota: quota.toString() })
          }
        </div>
        {quota !== -1 && (
          <Progress value={percentage} className="h-2" />
        )}
      </div>
    )
  }

  const getPlanName = () => {
    if (!userInfo.subscription.stripe_price_id) return t('auth.profile.subscription.plan.trial')
    if (userInfo.subscription.stripe_price_id === PLANS.monthly.priceId) return t('auth.profile.subscription.plan.monthly')
    if (userInfo.subscription.stripe_price_id === PLANS.yearly.priceId) return t('auth.profile.subscription.plan.yearly')
    return t('auth.profile.subscription.plan.trial')
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    if (language === 'zh') {
      return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`
    }
    return `${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')}/${date.getFullYear()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`
  }

  const renderNameField = () => {
    if (isEditingName) {
      return (
        <div className="flex items-center space-x-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t('auth.profile.basicInfo.editUsername.placeholder')}
            maxLength={50}
            className="max-w-[200px]"
          />
          <Button 
            onClick={updateName} 
            disabled={isUpdating}
            size="sm"
          >
            {t('auth.profile.basicInfo.editUsername.save')}
          </Button>
          <Button 
            onClick={() => setIsEditingName(false)}
            variant="outline"
            size="sm"
          >
            {t('auth.profile.basicInfo.editUsername.cancel')}
          </Button>
        </div>
      )
    }

    return (
      <div className="flex items-center space-x-2">
        <div className="text-lg font-medium">
          {userInfo?.user.name || '-'}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => {
            setNewName(userInfo?.user.name || '')
            setIsEditingName(true)
          }}
        >
          <Pencil className="h-4 w-4" />
        </Button>
      </div>
    )
  }

  return (
    <div className="container py-20">
      <h1 className="text-4xl font-bold mb-8">{t('auth.profile.title')}</h1>
      <div className="space-y-6">
        {/* Profile basics card */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-semibold">{t('auth.profile.basicInfo.title')}</h2>
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="p-4 bg-muted rounded-lg">
                <div className="text-sm text-muted-foreground mb-1">{t('auth.profile.basicInfo.email')}</div>
                <div className="text-lg font-medium">
                  {userInfo?.user.email || '-'}
                </div>
              </div>
              <div className="p-4 bg-muted rounded-lg">
                <div className="text-sm text-muted-foreground mb-1">{t('auth.profile.basicInfo.username')}</div>
                {renderNameField()}
              </div>
              <div className="p-4 bg-muted rounded-lg">
                <div className="text-sm text-muted-foreground mb-1">{t('auth.profile.basicInfo.userId')}</div>
                <div className="text-lg font-medium">
                  {userInfo?.user.id || '-'}
                </div>
              </div>
              <div className="p-4 bg-muted rounded-lg">
                <div className="text-sm text-muted-foreground mb-1">{t('auth.profile.basicInfo.registerTime')}</div>
                <div className="text-lg font-medium">
                  {userInfo?.user.created_at ? formatDate(userInfo.user.created_at) : '-'}
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Subscription card */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-semibold">{t('auth.profile.subscription.title')}</h2>
            <Badge variant={userInfo.subscription.stripe_price_id ? "default" : "secondary"}>
              {getPlanName()}
            </Badge>
          </div>
          
          <div className="space-y-4">
            {userInfo.subscription.stripe_customer_id && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div className="p-4 bg-muted rounded-lg">
                  <div className="text-sm text-muted-foreground mb-1">{t('auth.profile.subscription.customerId')}</div>
                  <div className="text-lg font-medium">
                    {userInfo.subscription.stripe_customer_id}
                  </div>
                </div>
                <div className="p-4 bg-muted rounded-lg">
                  <div className="text-sm text-muted-foreground mb-1">{t('auth.profile.subscription.subscriptionId')}</div>
                  <div className="text-lg font-medium">
                    {userInfo.subscription.stripe_subscription_id || '-'}
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {QUOTA_TYPES.map(type => (
                <div key={type}>
                  {renderQuotaItem(type)}
                </div>
              ))}
            </div>

            {userInfo.subscription.stripe_current_period_end && (
              <div className="text-sm text-muted-foreground">
                {t('auth.profile.subscription.expiryDate', { 
                  date: formatDate(userInfo.subscription.stripe_current_period_end)
                })}
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
} 