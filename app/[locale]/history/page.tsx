'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { usePathname, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Star, Trash2, Copy, Search, Loader2 } from 'lucide-react'
import { apiFetch } from '@/lib/api-fetch'
import { useI18n } from '@/lib/i18n/use-translations'
import { useLanguage } from '@/components/language-provider'
import { useLoginHref } from '@/lib/i18n/marketing-href'
import { cn } from '@/lib/utils'

interface TranslationItem {
  id: number
  source_text: string
  translated_text: string
  source_language: string | null
  target_language: string
  service: string | null
  is_favorite: boolean
  created_at: string
}

interface ListResponse {
  items: TranslationItem[]
  nextCursor: number | null
}

function formatDate(value: string, language: string): string {
  const d = new Date(value)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  if (language === 'zh' || language === 'ja') return `${y}-${m}-${day} ${hh}:${mm}`
  return `${m}/${day}/${y} ${hh}:${mm}`
}

export default function HistoryPage() {
  const { t } = useI18n()
  const { language } = useLanguage()
  const { data: session, status } = useSession()
  const router = useRouter()
  const pathname = usePathname()
  const loginHref = useLoginHref()

  const [items, setItems] = useState<TranslationItem[]>([])
  const [cursor, setCursor] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [search, setSearch] = useState('')
  const [favoritesOnly, setFavoritesOnly] = useState(false)

  // Debounce search so every keystroke doesn't re-query the DB.
  const [debouncedSearch, setDebouncedSearch] = useState('')
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => clearTimeout(handle)
  }, [search])

  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    if (debouncedSearch) params.set('q', debouncedSearch)
    if (favoritesOnly) params.set('favorite', '1')
    return params.toString()
  }, [debouncedSearch, favoritesOnly])

  // Track the most recent "fresh list" request so late responses cannot
  // overwrite newer filter results.
  const requestIdRef = useRef(0)

  const fetchList = useCallback(
    async (reset: boolean, before?: number) => {
      const params = new URLSearchParams(queryString)
      if (before) params.set('cursor', String(before))
      const qs = params.toString()

      if (reset) {
        setLoading(true)
      } else {
        setLoadingMore(true)
      }
      const myId = ++requestIdRef.current
      try {
        const res = await apiFetch(`/api/translations${qs ? `?${qs}` : ''}`)
        if (!res.ok) throw new Error(`${res.status}`)
        const data = (await res.json()) as ListResponse
        if (reset && myId !== requestIdRef.current) return
        setItems((prev) => (reset ? data.items : [...prev, ...data.items]))
        setCursor(data.nextCursor)
      } catch (err) {
        console.error('[history] fetch failed:', err)
        toast.error(t('history.loadError'))
      } finally {
        if (reset) setLoading(false)
        setLoadingMore(false)
      }
    },
    [queryString, t]
  )

  // Redirect unauthenticated users to login.
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push(`${loginHref}?callbackUrl=${encodeURIComponent(pathname)}`)
    }
  }, [status, router, loginHref, pathname])

  // Re-fetch whenever filters change.
  useEffect(() => {
    if (status === 'authenticated') {
      void fetchList(true)
    }
  }, [status, fetchList])

  const toggleFavorite = async (item: TranslationItem) => {
    const next = !item.is_favorite
    // Optimistic update.
    setItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, is_favorite: next } : it)))
    try {
      const res = await apiFetch(`/api/translations/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isFavorite: next }),
      })
      if (!res.ok) throw new Error(`${res.status}`)
    } catch (err) {
      console.error('[history] favorite failed:', err)
      // Roll back on error.
      setItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, is_favorite: item.is_favorite } : it)))
      toast.error(t('history.actionError'))
    }
  }

  const removeItem = async (item: TranslationItem) => {
    const snapshot = items
    setItems((prev) => prev.filter((it) => it.id !== item.id))
    try {
      const res = await apiFetch(`/api/translations/${item.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`${res.status}`)
      toast.success(t('history.deleted'))
    } catch (err) {
      console.error('[history] delete failed:', err)
      setItems(snapshot)
      toast.error(t('history.actionError'))
    }
  }

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(t('history.copied'))
    } catch {
      toast.error(t('history.actionError'))
    }
  }

  if (status === 'loading' || !session) {
    return (
      <div className="container py-20">
        <div className="flex items-center justify-center min-h-[200px] text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading...
        </div>
      </div>
    )
  }

  return (
    <div className="container py-10 md:py-16 max-w-4xl">
      <h1 className="text-3xl md:text-4xl font-bold mb-2">{t('history.title')}</h1>
      <p className="text-muted-foreground mb-6">{t('history.subtitle')}</p>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('history.searchPlaceholder')}
            className="pl-9"
            maxLength={200}
          />
        </div>
        <Button
          type="button"
          variant={favoritesOnly ? 'default' : 'outline'}
          onClick={() => setFavoritesOnly((v) => !v)}
          className="gap-2"
        >
          <Star className={cn('h-4 w-4', favoritesOnly && 'fill-current')} />
          {t('history.favoritesOnly')}
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center min-h-[200px] text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          {t('history.loading')}
        </div>
      ) : items.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground">
          {debouncedSearch || favoritesOnly ? t('history.noMatches') : t('history.empty')}
        </Card>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <Card key={item.id} className="p-5">
              <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="secondary">{item.target_language}</Badge>
                  {item.service && <Badge variant="outline">{item.service}</Badge>}
                  <span>{formatDate(item.created_at, language)}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => toggleFavorite(item)}
                    aria-label={t('history.toggleFavorite')}
                  >
                    <Star
                      className={cn(
                        'h-4 w-4',
                        item.is_favorite && 'fill-yellow-400 text-yellow-500'
                      )}
                    />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => copyText(item.translated_text)}
                    aria-label={t('history.copy')}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => removeItem(item)}
                    aria-label={t('history.delete')}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">{t('history.source')}</div>
                  <div className="text-sm whitespace-pre-wrap break-words">
                    {item.source_text}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">{t('history.translation')}</div>
                  <div className="text-sm whitespace-pre-wrap break-words">
                    {item.translated_text}
                  </div>
                </div>
              </div>
            </Card>
          ))}

          {cursor !== null && (
            <div className="flex justify-center pt-2">
              <Button
                variant="outline"
                onClick={() => fetchList(false, cursor)}
                disabled={loadingMore}
              >
                {loadingMore ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('history.loading')}
                  </>
                ) : (
                  t('history.loadMore')
                )}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
