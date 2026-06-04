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

/**
 * Hosts that a user-supplied media URL (video/audio) may point at before we
 * hand it to an Aliyun media service. We only ever upload to our own OSS
 * bucket, so restricting to that host prevents SSRF — i.e. asking Aliyun to
 * fetch internal metadata endpoints or arbitrary third-party URLs on our behalf.
 *
 * Set ALIYUN_OSS_PUBLIC_HOST to also allow a CDN / custom domain in front of OSS.
 */
export function allowedOssMediaHosts(): string[] {
  const hosts: string[] = []
  const bucket = process.env.ALIYUN_OSS_BUCKET?.trim()
  if (bucket && rawOssRegion()) {
    hosts.push(`${bucket}.${aliyunOssSdkRegion()}.aliyuncs.com`.toLowerCase())
  }
  const cdn = process.env.ALIYUN_OSS_PUBLIC_HOST?.trim()
  if (cdn) {
    hosts.push(cdn.toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, ''))
  }
  return hosts
}

/** True only for an https URL whose host is one of our OSS/CDN hosts (no creds, no other scheme). */
export function isAllowedOssMediaUrl(raw: string): boolean {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return false
  }
  if (url.protocol !== 'https:') return false
  if (url.username || url.password) return false
  return allowedOssMediaHosts().includes(url.hostname.toLowerCase())
}
