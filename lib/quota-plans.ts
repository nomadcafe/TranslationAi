export interface QuotaPlan {
  text_quota: number
  image_quota: number
  pdf_quota: number
  speech_quota: number
  video_quota: number
}

// Quota limits per subscription tier.
// These are the single source of truth – import from here instead of hardcoding.
export const FREE_QUOTA: QuotaPlan = {
  text_quota: -1,
  image_quota: 5,
  pdf_quota: 3,
  speech_quota: 2,
  video_quota: 1,
}

export const MONTHLY_QUOTA: QuotaPlan = {
  text_quota: -1,
  image_quota: 50,
  pdf_quota: 40,
  speech_quota: 30,
  video_quota: 10,
}

export const YEARLY_QUOTA: QuotaPlan = {
  text_quota: -1,
  image_quota: 100,
  pdf_quota: 80,
  speech_quota: 60,
  video_quota: 20,
}

export function getQuotasByPriceId(
  priceId: string | null,
  monthlyPriceId: string | undefined,
  yearlyPriceId: string | undefined
): QuotaPlan {
  if (priceId && priceId === monthlyPriceId) return MONTHLY_QUOTA
  if (priceId && priceId === yearlyPriceId) return YEARLY_QUOTA
  return FREE_QUOTA
}
