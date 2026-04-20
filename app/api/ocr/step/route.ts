import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { checkAndRecordUsage } from '@/lib/server/quota'
import { getRequestLocale, apiMsg } from '@/lib/server/request-i18n'
import { withAuth } from '@/lib/server/with-auth'
import { checkRateLimit } from '@/lib/server/rate-limit'
import { isAbortError } from '@/lib/server/openai-compat-translate'

export const maxDuration = 60;

export const POST = withAuth(async (request, auth) => {
  const locale = getRequestLocale(request)
  const signal = request.signal

  const rateCheck = await checkRateLimit(auth.userId, 'default')
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: apiMsg(locale, 'rateLimitExceeded'), retryAfter: rateCheck.retryAfter },
      { status: 429, headers: { 'Retry-After': String(rateCheck.retryAfter ?? 60) } },
    )
  }

  const quota = await checkAndRecordUsage(auth.userId, 'image', locale)
  if (!quota.allowed) return NextResponse.json({ error: quota.error }, { status: 403 })

  const apiKey = process.env.STEP_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: apiMsg(locale, 'apiKeyNotConfigured') },
      { status: 500 }
    );
  }

  try {
    let formData: FormData
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json({ error: apiMsg(locale, 'invalidRequestBody') }, { status: 400 })
    }
    const image = formData.get('image');

    if (!image || (typeof image !== 'string' && !(image instanceof File))) {
      return NextResponse.json(
        { error: apiMsg(locale, 'noImageProvided') },
        { status: 400 }
      );
    }
    if (image instanceof File && image.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: apiMsg(locale, 'fileTooLarge') },
        { status: 413 }
      )
    }

    const openai = new OpenAI({
      apiKey: apiKey,
      baseURL: 'https://api.stepfun.ai/v1',
      dangerouslyAllowBrowser: true,
      timeout: 30000 // 30s
    });

    // Up to 3 attempts.
    let retries = 3;
    let lastError: unknown;

    while (retries > 0) {
      try {
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError')

        const systemContent =
          locale === 'zh'
            ? '你是 OCR 助手，请准确提取图片中的文字。'
            : 'You are an OCR assistant. Extract text from the provided image accurately.'
        const userLine =
          locale === 'zh' ? '请提取这张图片中的文字：' : 'Please extract text from this image:'

        const response = await openai.chat.completions.create(
          {
            model: 'step-1v-32k',
            messages: [
              { role: 'system', content: systemContent },
              {
                role: 'user',
                content: [
                  { type: 'text', text: userLine },
                  { type: 'image_url', image_url: { url: image instanceof File ? URL.createObjectURL(image) : image.toString() } }
                ]
              }
            ]
          },
          { signal },
        );

        const extractedText = response.choices[0]?.message?.content;
        if (!extractedText) {
          throw new Error('noTextExtracted');
        }

        return NextResponse.json({ text: extractedText });
      } catch (error: unknown) {
        lastError = error;
        const status = (error as { status?: number })?.status
        if (status === 504) {
          retries--;
          if (retries > 0) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            continue;
          }
        }
        break;
      }
    }

    if (isAbortError(lastError) || signal.aborted) {
      return NextResponse.json({ error: 'aborted' }, { status: 499 })
    }
    console.error(
      `[ocr/step] userId=${auth.userId} error after retries:`,
      lastError instanceof Error ? (lastError.stack ?? lastError.message) : lastError,
    );
    const lastMsg = lastError instanceof Error ? lastError.message : ''
    if (lastMsg === 'noTextExtracted') {
      return NextResponse.json({ error: apiMsg(locale, 'noTextExtracted') }, { status: 400 })
    }
    return NextResponse.json(
      { error: apiMsg(locale, 'ocrFailed') },
      { status: 500 }
    );
  } catch (error) {
    if (isAbortError(error) || signal.aborted) {
      return NextResponse.json({ error: 'aborted' }, { status: 499 })
    }
    console.error(
      `[ocr/step] userId=${auth.userId} outer error:`,
      error instanceof Error ? (error.stack ?? error.message) : error,
    );
    return NextResponse.json(
      { error: apiMsg(locale, 'ocrFailed') },
      { status: 500 }
    );
  }
})
