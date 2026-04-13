import type { AppLocale } from './request-i18n'
import { apiMsg } from './request-i18n'
import { zhipuChatCompletionsUrl } from './zhipu-api-base'

/** Text translation (Z.AI). */
export const ZHIPU_TEXT_MODEL = 'glm-4.6'

/** Image / file OCR — fast multimodal. */
export const ZHIPU_VISION_FLASH_MODEL = 'glm-4.6v-flash'

/** Video frame analysis — stronger VLM. */
export const ZHIPU_VISION_VIDEO_MODEL = 'glm-4.6v'

function zhipuBearerHeaders(apiKey: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'Accept-Language': 'en-US,en',
    Authorization: `Bearer ${apiKey}`,
  }
}

export function requireZhipuApiKey(locale: AppLocale = 'zh'): string {
  const apiKey = process.env.ZHIPU_API_KEY?.trim()
  if (!apiKey) throw new Error(apiMsg(locale, 'zhipuKeyMissing'))
  return apiKey
}

const OCR_IMAGE = {
  zh: '请识别图片中的所有文字内容，只返回文字，不需要其他描述。',
  en: 'Recognize all text in the image. Return only the plain text, no descriptions.',
}

const OCR_VIDEO = {
  zh: '请识别视频中的所有文字内容，包括字幕、标题、显示的文本等。只需要返回文字内容，不需要其他描述。',
  en: 'Recognize all on-screen text in the video (subtitles, titles, captions, etc.). Return only plain text, no descriptions.',
}

const OCR_FILE = {
  zh: '请识别文件中的所有文字内容，只返回文字，不需要其他描述。',
  en: 'Recognize all text in the file. Return only plain text, no descriptions.',
}

export async function zhipuImageOcr(imageBase64: string, locale: AppLocale = 'zh'): Promise<string> {
  const apiKey = requireZhipuApiKey(locale)
  const base64Data = imageBase64.replace(/^data:image\/(png|jpeg|jpg);base64,/, '')
  const res = await fetch(zhipuChatCompletionsUrl(), {
    method: 'POST',
    headers: zhipuBearerHeaders(apiKey),
    body: JSON.stringify({
      model: ZHIPU_VISION_FLASH_MODEL,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: locale === 'zh' ? OCR_IMAGE.zh : OCR_IMAGE.en },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Data}` } },
          ],
        },
      ],
      temperature: 0.95,
      top_p: 0.7,
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: { message?: string } }).error?.message || apiMsg(locale, 'ocrGenericFailed'))
  }
  const data = await res.json()
  const text = data.choices?.[0]?.message?.content?.trim()
  if (!text) throw new Error(apiMsg(locale, 'noTextExtracted'))
  return text
}

export async function zhipuAnalyzeVideo(framesBase64: string[], locale: AppLocale = 'zh'): Promise<string> {
  const apiKey = requireZhipuApiKey(locale)
  const videoBase64 = framesBase64[0]
  if (!videoBase64) throw new Error(apiMsg(locale, 'zhipuVideoFrameMissing'))
  const res = await fetch(zhipuChatCompletionsUrl(), {
    method: 'POST',
    headers: zhipuBearerHeaders(apiKey),
    body: JSON.stringify({
      model: ZHIPU_VISION_VIDEO_MODEL,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: locale === 'zh' ? OCR_VIDEO.zh : OCR_VIDEO.en },
            { type: 'video_url', video_url: { url: `data:video/mp4;base64,${videoBase64}` } },
          ],
        },
      ],
      temperature: 0.95,
      top_p: 0.7,
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: { message?: string } }).error?.message || apiMsg(locale, 'videoAnalysisFailed'))
  }
  const data = await res.json()
  const result = data.choices?.[0]?.message?.content?.trim()
  if (!result) throw new Error(apiMsg(locale, 'noTextExtracted'))
  const lines = result.split('\n')
  const unique = Array.from(new Set(lines.filter((l: string) => l.trim())))
  return unique.join('\n')
}

export async function zhipuExtractFileContent(base64Data: string, mimeType: string, locale: AppLocale = 'zh'): Promise<string> {
  const apiKey = requireZhipuApiKey(locale)
  const res = await fetch(zhipuChatCompletionsUrl(), {
    method: 'POST',
    headers: zhipuBearerHeaders(apiKey),
    body: JSON.stringify({
      model: ZHIPU_VISION_FLASH_MODEL,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: locale === 'zh' ? OCR_FILE.zh : OCR_FILE.en },
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Data}` } },
          ],
        },
      ],
      temperature: 0.95,
      top_p: 0.7,
      max_tokens: 1024,
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: { message?: string } }).error?.message || apiMsg(locale, 'fileRecognitionFailed'))
  }
  const data = await res.json()
  const text = data.choices?.[0]?.message?.content?.trim()
  if (!text) throw new Error(apiMsg(locale, 'noTextExtracted'))
  return text
}
