"use client"

import { apiFetch } from '@/lib/api-fetch'

// Retry helper with exponential backoff.
async function retryWithDelay<T>(
  fn: () => Promise<T>,
  retries = 3,
  delay = 1000,
  backoff = 2
): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    if (retries === 0) {
      throw error;
    }
    
    await new Promise(resolve => setTimeout(resolve, delay));
    return retryWithDelay(fn, retries - 1, delay * backoff, backoff);
  }
}

// Text translation via Qwen (Alibaba Cloud Model Studio).
export async function translateWithQwen(text: string, targetLang: string) {
  try {
    return await retryWithDelay(async () => {
      // Split long text by paragraph blocks.
      const segments = text.split('\n\n');
      const translatedSegments = [];
      
      for (const segment of segments) {
        if (!segment.trim()) {
          translatedSegments.push('');
          continue;
        }
        
        const response = await apiFetch('/api/qwen/translate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text: segment.trim(),
            targetLang,
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || '翻译请求失败');
        }

        const result = await response.json();
        translatedSegments.push(result.text.trim());
      }
      
      return translatedSegments.join('\n\n');
    });
  } catch (error: any) {
    console.error('Error translating with Qwen:', error);
    throw new Error(error.message || '翻译失败，请稍后重试');
  }
}

export async function extractTextWithQwen(imageBase64: string): Promise<string> {
  try {
    const base64Data = imageBase64.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, '')

    const response = await apiFetch('/api/qwen/ocr', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image: base64Data,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || '文字识别失败');
    }

    const result = await response.json();
    return result.text.trim();
  } catch (error: any) {
    console.error('Qwen OCR error:', error);
    throw new Error(error.message || '文字识别失败');
  }
} 