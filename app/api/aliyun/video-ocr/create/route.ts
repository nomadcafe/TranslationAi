import { NextResponse } from 'next/server'
import RPCClient from '@alicloud/pop-core'
import { checkAndRecordUsage } from '@/lib/server/quota'
import { getRequestLocale, apiMsg } from '@/lib/server/request-i18n'
import { aliyunVideorecogEndpoint } from '@/lib/server/aliyun-region'
import { parseJson } from '@/lib/server/validate'
import { VideoUrlBody } from '@/lib/validation/schemas'
import { withAuth } from '@/lib/server/with-auth'

interface AsyncJobResult {
  RequestId: string
  Message: string
}

export const POST = withAuth(async (request, auth) => {
  const locale = getRequestLocale(request)
  try {
    const quota = await checkAndRecordUsage(auth.userId, 'video', locale)
    if (!quota.allowed) return NextResponse.json({ message: quota.error }, { status: 403 })

    if (!process.env.ALIYUN_OSS_REGION) {
      return NextResponse.json({ message: apiMsg(locale, 'ossEnvMissing') }, { status: 500 })
    }

    const parsed = await parseJson(request, VideoUrlBody, locale, {
      errorKey: 'missingVideoUrl',
      errorField: 'message',
    })
    if (!parsed.ok) return parsed.response
    const { videoUrl } = parsed.data

    const client = new RPCClient({
      accessKeyId: process.env.ALIYUN_ACCESS_KEY_ID || '',
      accessKeySecret: process.env.ALIYUN_ACCESS_KEY_SECRET || '',
      endpoint: aliyunVideorecogEndpoint(),
      apiVersion: '2020-03-20',
    })

    try {
      console.log('开始创建视频识别任务...')
      const params = {
        VideoUrl: videoUrl,
        Params: JSON.stringify([{
          Type: 'subtitles'
        }])
      }

      const result = await client.request<AsyncJobResult>('RecognizeVideoCastCrewList', params, {
        method: 'POST',
        formatParams: false,
        headers: {
          'content-type': 'application/json'
        }
      })
      
      console.log('创建任务结果:', result)

      if (!result.RequestId) {
        throw new Error(apiMsg(locale, 'videoTaskNoRequestId'))
      }

      return NextResponse.json({
        success: true,
        taskId: result.RequestId,
        message: result.Message
      })
    } catch (createError: any) {
      console.error('创建任务错误详情:', {
        name: createError.name,
        message: createError.message,
        code: createError.code,
        requestId: createError.RequestId,
        stack: createError.stack
      })
      throw new Error(`${apiMsg(locale, 'videoTaskCreateFailed')}: ${createError.message}`)
    }

  } catch (error: any) {
    console.error('处理请求错误:', error)
    return NextResponse.json(
      { message: error.message || apiMsg(locale, 'videoTaskCreateFailed') },
      { status: 500 }
    )
  }
}, { errorField: 'message' })
