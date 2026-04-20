import { z } from 'zod'

const MAX_TEXT_CHARS = 10_000
const MAX_BASE64_CHARS = 15_000_000
const MAX_NAME_LEN = 50
const MAX_LANG_LEN = 64

export const TRANSLATE_SERVICES = [
  'deepseek',
  'qwen',
  'zhipu',
  '4o-mini',
  'hunyuan',
  'minimax',
  'siliconflow',
  'claude',
  'claude_3_5',
  'kimi',
  'gemini',
  'step',
] as const
export type TranslateService = (typeof TRANSLATE_SERVICES)[number]

export const TranslateBody = z.object({
  text: z.string().min(1).max(MAX_TEXT_CHARS),
  targetLanguage: z.string().min(1).max(MAX_LANG_LEN),
  service: z.enum(TRANSLATE_SERVICES).optional(),
})

export const TranslateTargetLangBody = z.object({
  text: z.string().min(1).max(MAX_TEXT_CHARS),
  targetLang: z.string().min(1).max(MAX_LANG_LEN),
})

export const ImageBody = z.object({
  image: z.string().min(1).max(MAX_BASE64_CHARS),
})

export const FramesBody = z.object({
  frames: z.array(z.string().min(1).max(MAX_BASE64_CHARS)).min(1).max(200),
})

export const ExtractFileBody = z.object({
  base64Data: z.string().min(1).max(MAX_BASE64_CHARS),
  mimeType: z.string().max(128).optional(),
})

export const FileExtractBody = z.object({
  file: z.string().min(1).max(MAX_BASE64_CHARS),
  filename: z.string().min(1).max(512),
  service: z.enum(['kimi', 'mistral']),
})

export const UploadBody = z.object({
  file: z.string().min(1).max(MAX_BASE64_CHARS),
  type: z.enum(['image', 'video']),
})

export const UpdateUserBody = z.object({
  name: z.string().min(1).max(MAX_NAME_LEN),
})

export const UsageBody = z.object({
  type: z.enum(['text', 'image', 'pdf', 'speech', 'video']),
})

export const RegisterBody = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(8).max(128),
})

export const SubscriptionBody = z.object({
  priceId: z.string().min(1).max(256),
})

export const TaskIdBody = z.object({
  taskId: z.string().min(1).max(256),
})

export const VideoUrlBody = z.object({
  videoUrl: z.string().url().max(2048),
})

export const AsrRecognizeBody = z.object({
  audioUrl: z.string().url().max(2048),
  appKey: z.string().min(1).max(256),
  token: z.string().min(1).max(1024),
  taskId: z.string().min(1).max(256).optional(),
})

export const AsrCreateBody = z.object({
  engineType: z.string().min(1).max(64),
  channelNum: z.number().int().min(1).max(2),
  resTextFormat: z.number().int().min(0).max(10),
  sourceType: z.number().int().min(0).max(10),
  data: z.string().min(1).max(MAX_BASE64_CHARS),
})

export const OssUploadFormBody = z.object({
  file: z.instanceof(File),
})

export const TranslationListQuery = z.object({
  q: z.string().max(200).optional(),
  favorite: z.enum(['1', 'true']).optional(),
  cursor: z.coerce.number().int().positive().max(2_147_483_647).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
})

export const TranslationPatchBody = z.object({
  isFavorite: z.boolean(),
})

