import { encode } from 'base64-arraybuffer'
import { apiFetch } from '@/lib/api-fetch'

// Image OCR via Kimi API route.
export async function extractTextWithKimi(image: string): Promise<string> {
  try {
    // Normalize image payload for the API.
    let imageData = image;
    if (!image.includes(';base64,')) {
      // Raw base64: add a data URL prefix with MIME type.
      if (image.startsWith('/9j/')) {
        imageData = `data:image/jpeg;base64,${image}`;
      } else if (image.startsWith('iVBOR')) {
        imageData = `data:image/png;base64,${image}`;
      } else {
        // Default to JPEG when format is unknown.
        imageData = `data:image/jpeg;base64,${image}`;
      }
    }

    const response = await apiFetch('/api/ocr/kimi', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ image: imageData }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Kimi OCR error response:', errorData);
      throw new Error(`OCR request failed: ${response.status} ${errorData}`);
    }

    const data = await response.json();
    return data.text;
  } catch (error: any) {
    console.error('Error extracting text with Kimi:', error);
    throw error;
  }
}

// Retry helper with backoff.
async function retryWithDelay<T>(
  fn: () => Promise<T>,
  retries = 5,
  delay = 2000,
  backoff = 1.5,
  onRetry?: (retriesLeft: number, error: Error) => void
): Promise<T> {
  try {
    return await fn()
  } catch (error: any) {
    if (retries === 0 || error.message.includes('API密钥') || error.message.includes('大小超过限制')) {
      throw error
    }
    
    if (onRetry) {
      onRetry(retries, error)
    }
    await new Promise(resolve => setTimeout(resolve, delay))
    return retryWithDelay(fn, retries - 1, delay * backoff, backoff, onRetry)
  }
}

// Generic PDF extraction; pick Kimi or Mistral backend.
export async function extractPDFContent(
  file: File,
  service: 'kimi' | 'mistral' = 'mistral', // Default: Mistral OCR.
  onProgress?: (status: string) => void
): Promise<string> {
  try {
    // Enforce max file size (5MB) for server limits.
    const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
    if (file.size > MAX_FILE_SIZE) {
      throw new Error('文件大小不能超过5MB')
    }

    // Validate MIME/type.
    if (!file.type.includes('pdf')) {
      throw new Error('请上传PDF文件')
    }

    // Read file as base64 data URL.
    const compressedFile = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => {
        try {
          const base64 = reader.result as string
          const base64Data = base64.split(',')[1]
          // Reject oversized base64 payloads early.
          if (base64Data.length > 5 * 1024 * 1024) { // 5MB in base64
            reject(new Error('文件太大，请上传更小的文件'))
            return
          }
          resolve(base64Data)
        } catch (err) {
          reject(new Error('文件处理失败'))
        }
      }
      reader.onerror = () => reject(new Error('文件读取失败'))
      reader.readAsDataURL(file)
    })

    // POST to extract API with retries.
    return await retryWithDelay(
      async () => {
        if (onProgress) {
          onProgress(`正在使用${service === 'mistral' ? 'Mistral OCR' : 'Kimi'}处理文件...`)
        }

        const response = await apiFetch('/api/file/extract', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            file: compressedFile,
            filename: file.name,
            service: service
          }),
        })

        if (!response.ok) {
          const error = await response.json()
          if (response.status === 503) {
            throw new Error(error.error || '服务暂时不可用，正在重试...')
          }
          throw new Error(error.error || '文件处理失败')
        }

        const data = await response.json()
        
        // Normalize various API response shapes.
        if (!data.text || data.text.trim() === '') {
          console.warn('API 返回的数据中没有有效的 text 字段:', data)
          
          // Fallback fields that may hold extracted text.
          if (data.content) {
            return typeof data.content === 'string' ? data.content : JSON.stringify(data.content)
          }
          
          if (data.result) {
            return typeof data.result === 'string' ? data.result : JSON.stringify(data.result)
          }
          
          if (data.extracted_text) {
            return data.extracted_text
          }
          
          // No extractable text: return a user-facing placeholder string.
          return '无法从文件中提取文本。请尝试使用其他服务或上传不同的文件。'
        }

        return data.text
      },
      2, // Retries reduced from 5 to 2.
      3000, // Initial delay increased from 2000ms to 3000ms.
      1.5,
      (retriesLeft, error) => {
        if (onProgress) {
          if (error.message.includes('上传超时')) {
            onProgress(`文件上传超时，正在重试...（剩余${retriesLeft}次）`)
          } else if (error.message.includes('内容获取超时')) {
            onProgress(`文件内容获取超时，正在重试...（剩余${retriesLeft}次）`)
          } else if (error.message.includes('处理超时')) {
            onProgress(`内容处理超时，正在重试...（剩余${retriesLeft}次）`)
          } else {
            onProgress(`处理失败，正在重试...（剩余${retriesLeft}次）`)
          }
        }
      }
    )
  } catch (error: any) {
    console.error('文件处理错误:', error)
    throw error
  }
}

// Backwards-compatible alias (Kimi-only).
export async function extractPDFWithKimi(
  file: File,
  onProgress?: (status: string) => void
): Promise<string> {
  return extractPDFContent(file, 'kimi', onProgress)
}