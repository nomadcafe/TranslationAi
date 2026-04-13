import { createHmac, createHash } from 'crypto';

interface SignParams {
  secretId: string;
  secretKey: string;
  endpoint: string;
  service: string;
  version: string;
  region: string;
  action: string;
  timestamp: number;
  payload: any;
}

function sha256hex(message: string): string {
  const hash = createHash('sha256');
  hash.update(message);
  return hash.digest('hex');
}

function getDate(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toISOString().split('T')[0];
}

export function sign(params: SignParams): string {
  const {
    secretId,
    secretKey,
    endpoint,
    service,
    version,
    region,
    action,
    timestamp,
    payload,
  } = params;

  // 1. Build canonical request.
  const httpRequestMethod = 'POST';
  const canonicalUri = '/';
  const canonicalQueryString = '';
  const canonicalHeaders = `content-type:application/json\nhost:${endpoint}\n`;
  const signedHeaders = 'content-type;host';
  const hashedRequestPayload = sha256hex(JSON.stringify(payload));
  const canonicalRequest = `${httpRequestMethod}\n${canonicalUri}\n${canonicalQueryString}\n${canonicalHeaders}\n${signedHeaders}\n${hashedRequestPayload}`;

  // 2. Build string to sign.
  const algorithm = 'TC3-HMAC-SHA256';
  const date = getDate(timestamp);
  const credentialScope = `${date}/${service}/tc3_request`;
  const hashedCanonicalRequest = sha256hex(canonicalRequest);
  const stringToSign = `${algorithm}\n${timestamp}\n${credentialScope}\n${hashedCanonicalRequest}`;

  // 3. Derive TC3 signature.
  const secretDate = createHmac('sha256', `TC3${secretKey}`).update(date).digest();
  const secretService = createHmac('sha256', secretDate).update(service).digest();
  const secretSigning = createHmac('sha256', secretService).update('tc3_request').digest();
  const signature = createHmac('sha256', secretSigning).update(stringToSign).digest('hex');

  // 4. Build Authorization header value.
  return `${algorithm} Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
} 