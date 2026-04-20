import { NextResponse } from 'next/server'
import RPCClient from '@alicloud/pop-core'
import { aliyunVideorecogEndpoint } from '@/lib/server/aliyun-region'
import { getRequestLocale, apiMsg } from '@/lib/server/request-i18n'
import { parseJson } from '@/lib/server/validate'
import { TaskIdBody } from '@/lib/validation/schemas'
import { withAuth } from '@/lib/server/with-auth'
import { checkRateLimit } from '@/lib/server/rate-limit'

interface VideoOCRResult {
  OcrResults?: Array<{
    DetailInfo: Array<{
      Text: string
      TimeStamp: number
    }>
    StartTime: number
    EndTime: number
  }>
  VideoOcrResults?: Array<{
    DetailInfo: Array<{
      Text: string
    }>
    StartTime: number
    EndTime: number
  }>
  SubtitlesResults?: Array<{
    SubtitlesAllResults?: Record<string, string>
    SubtitlesChineseResults?: Record<string, string>
    SubtitlesEnglishResults?: Record<string, string>
    SubtitlesAllResultsUrl?: string
    SubtitlesChineseResultsUrl?: string
    SubtitlesEnglishResultsUrl?: string
  }>
}

interface AsyncJobQueryResult {
  RequestId: string
  Data: {
    Status: string
    Result: string
    JobId: string
  }
}

export const POST = withAuth(async (request, auth) => {
  const locale = getRequestLocale(request)

  try {
    const rateCheck = await checkRateLimit(auth.userId, 'default')
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { message: apiMsg(locale, 'rateLimitExceeded'), retryAfter: rateCheck.retryAfter },
        { status: 429, headers: { 'Retry-After': String(rateCheck.retryAfter ?? 60) } },
      )
    }

    const parsed = await parseJson(request, TaskIdBody, locale, { errorField: 'message' })
    if (!parsed.ok) return parsed.response
    const { taskId } = parsed.data

    if (!process.env.ALIYUN_OSS_REGION?.trim()) {
      return NextResponse.json(
        { message: 'ALIYUN_OSS_REGION is not configured' },
        { status: 500 }
      )
    }

    // VIAPI client for polling job status.
    const client = new RPCClient({
      accessKeyId: process.env.ALIYUN_ACCESS_KEY_ID || '',
      accessKeySecret: process.env.ALIYUN_ACCESS_KEY_SECRET || '',
      endpoint: aliyunVideorecogEndpoint(),
      apiVersion: '2020-03-20',
      opts: {
        method: 'POST',
        timeout: 60000
      }
    })

    try {
      // Fetch task output / state.
      console.log('开始查询任务结果, taskId:', taskId)
      const params = {
        JobId: taskId
      }

      // Call Aliyun.
      const result = await client.request<AsyncJobQueryResult>('GetAsyncJobResult', params, {
        method: 'POST',
        formatParams: true,
        headers: {
          'content-type': 'application/x-www-form-urlencoded'
        }
      })
      
      console.log('原始查询结果:', JSON.stringify(result, null, 2))

      // Validate response envelope.
      if (!result || !result.Data) {
        console.log('未获取到Data字段:', result)
        throw new Error('查询任务失败：未获取到任务结果')
      }

      console.log('任务状态:', result.Data.Status)

      // Map vendor status -> HTTP + payload.
      switch (result.Data.Status) {
        case 'PROCESS_RUNNING':
          console.log('任务正在处理中...')
          return NextResponse.json({
            success: true,
            status: 'running',
            message: '任务正在处理中'
          }, { status: 202 })

        case 'PROCESS_FAILED':
          console.log('任务处理失败:', result.Data)
          return NextResponse.json({
            success: false,
            status: 'failed',
            message: '任务处理失败',
            data: result.Data
          }, { status: 500 })

        case 'PROCESS_SUCCESS':
          console.log('任务处理成功，开始解析结果')
          let ocrResult: VideoOCRResult | null = null
          
          try {
            // Parse JSON-ish Result field when present.
            if (result.Data.Result) {
              console.log('解析字符串结果:', result.Data.Result)
              if (typeof result.Data.Result === 'string') {
                ocrResult = JSON.parse(result.Data.Result)
              } else {
                ocrResult = result.Data.Result as VideoOCRResult
              }
            }

            // Collect text across OCR/subtitle blocks.
            const textContents: string[] = []
            
            // Normalize OcrResults[].
            if (ocrResult?.OcrResults) {
              ocrResult.OcrResults.forEach(result => {
                result.DetailInfo.forEach(detail => {
                  if (detail.Text) {
                    textContents.push(detail.Text)
                  }
                })
              })
            }

            // Normalize VideoOcrResults[].
            if (ocrResult?.VideoOcrResults) {
              ocrResult.VideoOcrResults.forEach(result => {
                result.DetailInfo.forEach(detail => {
                  if (detail.Text) {
                    textContents.push(detail.Text)
                  }
                })
              })
            }

            // Subtitle / ASR-style lines.
            if (ocrResult?.SubtitlesResults?.[0]) {
              const subtitles = ocrResult.SubtitlesResults[0]
              if (subtitles.SubtitlesChineseResults) {
                Object.values(subtitles.SubtitlesChineseResults).forEach(text => {
                  textContents.push(text)
                })
              }
              return NextResponse.json({
                success: true,
                status: 'success',
                data: {
                  text: textContents.join('\n'),
                  subtitles: {
                    all: subtitles.SubtitlesAllResults,
                    chinese: subtitles.SubtitlesChineseResults,
                    english: subtitles.SubtitlesEnglishResults,
                    allUrl: subtitles.SubtitlesAllResultsUrl,
                    chineseUrl: subtitles.SubtitlesChineseResultsUrl,
                    englishUrl: subtitles.SubtitlesEnglishResultsUrl
                  },
                  raw: ocrResult
                }
              })
            }

            // No subtitles: return plain OCR text if any.
            return NextResponse.json({
              success: true,
              status: 'success',
              data: {
                text: textContents.join('\n'),
                raw: ocrResult
              }
            })

          } catch (e) {
            console.error('解析OCR结果失败:', e)
            console.log('返回原始结果')
            return NextResponse.json({
              success: true,
              status: 'success',
              data: {
                text: result.Data.Result,
                raw: result.Data.Result
              }
            })
          }

        case 'PROCESS_PENDING':
          console.log('任务等待处理中...')
          return NextResponse.json({
            success: true,
            status: 'pending',
            message: '任务等待处理中'
          }, { status: 202 })

        default:
          console.log('收到未知任务状态:', result.Data.Status, '完整结果:', result.Data)
          return NextResponse.json({
            success: true,
            status: result.Data.Status,
            message: '任务状态未知，请继续轮询',
            data: result.Data
          }, { status: 202 })
      }

    } catch (queryError: unknown) {
      console.error(
        `[video-ocr/status] userId=${auth.userId} upstream error:`,
        queryError instanceof Error ? (queryError.stack ?? queryError.message) : queryError,
      )
      throw new Error('upstream')
    }

  } catch (error) {
    console.error(
      `[video-ocr/status] userId=${auth.userId} error:`,
      error instanceof Error ? (error.stack ?? error.message) : error,
    )
    return NextResponse.json(
      { message: apiMsg(locale, 'videoAnalysisFailed') },
      { status: 500 }
    )
  }
}, { errorField: 'message' })
