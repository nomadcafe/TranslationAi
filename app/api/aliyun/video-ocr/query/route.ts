import { NextResponse } from 'next/server'
import RPCClient from '@alicloud/pop-core'
import { aliyunVideorecogEndpoint } from '@/lib/server/aliyun-region'
import { getRequestLocale } from '@/lib/server/request-i18n'
import { parseJson } from '@/lib/server/validate'
import { TaskIdBody } from '@/lib/validation/schemas'
import { withAuth } from '@/lib/server/with-auth'

interface AsyncJobQueryResult {
  RequestId: string
  Data: {
    Status: string
    Result: string
    JobId: string
  }
}

export const POST = withAuth(async (request) => {
  const locale = getRequestLocale(request)

  try {
    const parsed = await parseJson(request, TaskIdBody, locale, { errorField: 'message' })
    if (!parsed.ok) return parsed.response
    const { taskId } = parsed.data

    if (!process.env.ALIYUN_OSS_REGION?.trim()) {
      return NextResponse.json(
        { message: 'ALIYUN_OSS_REGION is not configured' },
        { status: 500 }
      )
    }

    // VIAPI client.
    const client = new RPCClient({
      accessKeyId: process.env.ALIYUN_ACCESS_KEY_ID || '',
      accessKeySecret: process.env.ALIYUN_ACCESS_KEY_SECRET || '',
      endpoint: aliyunVideorecogEndpoint(),
      apiVersion: '2020-03-20'
    })

    try {
      // Single-shot query by task id.
      console.log('开始查询任务结果, taskId:', taskId)
      const params = {
        JobId: taskId
      }

      // Call Aliyun.
      const result = await client.request<AsyncJobQueryResult>('GetAsyncJobResult', params)
      
      console.log('原始查询结果:', JSON.stringify(result, null, 2))

      if (!result.Data) {
        console.log('未获取到Data字段:', result)
        throw new Error('查询任务失败：未获取到任务结果')
      }

      console.log('任务状态:', result.Data.Status)
      console.log('任务结果:', result.Data.Result)

      // Still running -> 202 for client polling UX.
      if (result.Data.Status === 'PROCESS_RUNNING') {
        console.log('任务正在处理中...')
        return NextResponse.json({
          success: true,
          status: 'running',
          message: '任务正在处理中'
        }, { status: 202 })
      }

      // FAILED -> surface vendor message.
      if (result.Data.Status === 'PROCESS_FAILED') {
        console.log('任务处理失败')
        throw new Error('任务处理失败')
      }

      // FINISHED -> return merged transcript text.
      if (result.Data.Status === 'PROCESS_SUCCESS') {
        console.log('任务处理成功，开始解析结果')
        let ocrResult = {}
        try {
          if (typeof result.Data.Result === 'string') {
            console.log('解析字符串结果')
            ocrResult = JSON.parse(result.Data.Result)
          } else {
            console.log('使用原始结果对象')
            ocrResult = result.Data.Result
          }
          console.log('解析后的结果:', ocrResult)
        } catch (e) {
          console.error('解析OCR结果失败:', e)
          console.log('使用原始结果')
          ocrResult = result.Data.Result
        }

        return NextResponse.json({
          success: true,
          status: 'success',
          data: ocrResult
        })
      }

      // Unknown/intermediate state
      console.log('未知的任务状态:', result.Data.Status)
      return NextResponse.json({
        success: false,
        status: result.Data.Status,
        message: '未知的任务状态',
        data: result.Data
      })

    } catch (queryError: any) {
      console.error('查询任务错误详情:', {
        name: queryError.name,
        message: queryError.message,
        code: queryError.code,
        requestId: queryError.RequestId,
        stack: queryError.stack
      })
      throw new Error(`查询视频识别任务失败: ${queryError.message}`)
    }

  } catch (error: any) {
    console.error('处理请求错误:', error)
    return NextResponse.json(
      { message: error.message || '查询视频识别任务失败' },
      { status: 500 }
    )
  }
}, { errorField: 'message' })
