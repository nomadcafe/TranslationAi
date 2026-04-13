/**
 * ALIYUN_OSS_REGION drives OSS + Video Recognition (videorecog.*.aliyuncs.com).
 * Accept either public id (cn-hangzhou, cn-shanghai) or OSS form (oss-cn-hangzhou).
 */

function rawOssRegion(): string | undefined {
  return process.env.ALIYUN_OSS_REGION?.trim() || undefined
}

/** Public region id, e.g. cn-hangzhou (for videorecog.{id}.aliyuncs.com and STS regionId). */
export function aliyunPublicRegionId(): string {
  const v = rawOssRegion()
  if (!v) throw new Error('ALIYUN_OSS_REGION is not set')
  return v.replace(/^oss-/, '')
}

/** Region string for ali-oss SDK, e.g. oss-cn-hangzhou. */
export function aliyunOssSdkRegion(): string {
  const v = rawOssRegion()
  if (!v) throw new Error('ALIYUN_OSS_REGION is not set')
  return v.startsWith('oss-') ? v : `oss-${v}`
}

export function aliyunVideorecogEndpoint(): string {
  return `https://videorecog.${aliyunPublicRegionId()}.aliyuncs.com`
}
