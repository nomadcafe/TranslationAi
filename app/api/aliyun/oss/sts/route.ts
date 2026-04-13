import { NextResponse } from 'next/server'
import * as $OpenApi from '@alicloud/openapi-client'
import * as $STS20150401 from '@alicloud/sts20150401'
import { requireAuth } from '@/lib/server/require-auth'
import { getRequestLocale, apiMsg } from '@/lib/server/request-i18n'
import { aliyunOssSdkRegion, aliyunPublicRegionId } from '@/lib/server/aliyun-region'

export async function GET(request: Request) {
  const locale = getRequestLocale(request)
  try {
    const auth = await requireAuth()
    if (!auth) return NextResponse.json({ message: apiMsg(locale, 'unauthenticated') }, { status: 401 })

    if (!process.env.ALIYUN_ACCESS_KEY_ID || 
        !process.env.ALIYUN_ACCESS_KEY_SECRET || 
        !process.env.ALIYUN_RAM_ROLE_ARN || 
        !process.env.ALIYUN_OSS_BUCKET ||
        !process.env.ALIYUN_OSS_REGION) {
      throw new Error(apiMsg(locale, 'ossEnvMissing'))
    }

    const config = new $OpenApi.Config({
      accessKeyId: process.env.ALIYUN_ACCESS_KEY_ID,
      accessKeySecret: process.env.ALIYUN_ACCESS_KEY_SECRET,
      endpoint: 'sts.aliyuncs.com',
      regionId: aliyunPublicRegionId(),
    })

    const client = new $STS20150401.default(config)

    const result = await client.assumeRole({
      roleArn: process.env.ALIYUN_RAM_ROLE_ARN,
      roleSessionName: 'video-upload',
      durationSeconds: 900
    })

    console.log('STS 响应成功')

    if (!result.body || !result.body.credentials) {
      console.error('无效的 STS 响应结构:', result)
      throw new Error(apiMsg(locale, 'stsInvalidResponse'))
    }

    return NextResponse.json({
      success: true,
      data: {
        region: aliyunOssSdkRegion(),
        bucket: process.env.ALIYUN_OSS_BUCKET,
        credentials: {
          accessKeyId: result.body.credentials.accessKeyId,
          accessKeySecret: result.body.credentials.accessKeySecret,
          securityToken: result.body.credentials.securityToken,
          expiration: result.body.credentials.expiration
        }
      }
    })
  } catch (error: any) {
    console.error('STS token error:', error?.code, error?.message)
    return NextResponse.json({
      success: false,
      message: `${apiMsg(locale, 'credentialFetchFailed')}: ${error.message || ''}`.trim(),
      error: {
        code: error.code,
        message: error.message,
        data: error.data,
        statusCode: error.statusCode
      }
    }, { status: 500 })
  }
}
