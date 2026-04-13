import { NextResponse } from 'next/server'
import { Mistral } from '@mistralai/mistralai'
import { requireAuth } from '@/lib/server/require-auth'
import { checkAndRecordUsage } from '@/lib/server/quota'
import type { AppLocale } from '@/lib/server/request-i18n'
import { getRequestLocale, apiMsg } from '@/lib/server/request-i18n'

import { getKimiApiBaseUrl } from '@/lib/server/kimi-api-base'

const KIMI_API_KEY = process.env.KIMI_API_KEY
const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY

// Longer timeouts for Kimi upload/content/chat steps.
const TIMEOUT = {
  UPLOAD: 20000,    // 20s
  CONTENT: 30000,   // 30s
  PROCESS: 45000    // 45s
}

// fetch() with AbortSignal timeout.
async function fetchWithTimeout(url: string, options: RequestInit, timeout: number, locale: AppLocale) {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    })
    clearTimeout(id)
    
    // Propagate non-OK HTTP as Error.
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: apiMsg(locale, 'requestFailed') } }))
      throw new Error(error.error?.message || `${apiMsg(locale, 'requestFailed')}: ${response.status}`)
    }
    
    return response
  } catch (error: any) {
    clearTimeout(id)
    if (error.name === 'AbortError') {
      throw new Error(apiMsg(locale, 'requestTimeout'))
    }
    throw error
  }
}

// Kimi: upload PDF to Files API.
async function uploadFile(file: string, filename: string, locale: AppLocale) {
  try {
    const formData = new FormData()
    const fileBlob = new Blob([Buffer.from(file, 'base64')], { type: 'application/pdf' })
    const pdfFile = new File([fileBlob], filename, { type: 'application/pdf' })
    formData.append('file', pdfFile)
    formData.append('purpose', 'file-extract')

    const uploadResponse = await fetchWithTimeout(`${getKimiApiBaseUrl()}/files`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${KIMI_API_KEY}`
      },
      body: formData
    }, TIMEOUT.UPLOAD, locale)

    if (!uploadResponse.ok) {
      const error = await uploadResponse.json().catch(() => ({ error: { message: apiMsg(locale, 'fileUploadFailed') } }))
      console.error('KIMI文件上传错误:', error)
      throw new Error(error.error?.message || apiMsg(locale, 'fileUploadFailed'))
    }

    return await uploadResponse.json()
  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw new Error(apiMsg(locale, 'requestTimeout'))
    }
    throw error
  }
}

// Kimi: fetch uploaded file text content.
async function getFileContent(fileId: string, locale: AppLocale) {
  try {
    const contentResponse = await fetchWithTimeout(`${getKimiApiBaseUrl()}/files/${fileId}/content`, {
      headers: {
        'Authorization': `Bearer ${KIMI_API_KEY}`
      }
    }, TIMEOUT.CONTENT, locale)

    if (!contentResponse.ok) {
      const error = await contentResponse.json().catch(() => ({ error: { message: apiMsg(locale, 'fileContentFailed') } }))
      console.error('KIMI文件内容获取错误:', error)
      throw new Error(error.error?.message || apiMsg(locale, 'fileContentFailed'))
    }

    return await contentResponse.text()
  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw new Error(apiMsg(locale, 'fileContentTimeout'))
    }
    throw error
  }
}

// Kimi: chat completion to extract plain text from file content.
async function processContent(content: string, locale: AppLocale) {
  try {
    const systemIntro =
      locale === 'zh'
        ? '你是 Kimi，由 Moonshot AI 提供的人工智能助手。请提取文件中的所有文字内容，保持原文的格式和换行，不需要总结或解释。'
        : 'You are Kimi (Moonshot AI). Extract all text from the file, preserve layout and line breaks. Do not summarize.'
    const userAsk =
      locale === 'zh'
        ? '请直接返回文件的原始内容，保持格式，不要添加任何解释或总结。'
        : 'Return the raw file text only, preserve formatting, no commentary.'

    const messages = [
      { role: 'system', content: systemIntro },
      { role: 'system', content },
      { role: 'user', content: userAsk },
    ]

    const chatResponse = await fetchWithTimeout(`${getKimiApiBaseUrl()}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${KIMI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'moonshot-v1-32k',
        messages,
        temperature: 0.3
      })
    }, TIMEOUT.PROCESS, locale)

    if (!chatResponse.ok) {
      const error = await chatResponse.json().catch(() => ({ error: { message: apiMsg(locale, 'apiRequestFailed') } }))
      console.error('KIMI API错误:', error)
      throw new Error(error.error?.message || apiMsg(locale, 'apiRequestFailed'))
    }

    const data = await chatResponse.json()
    if (!data.choices?.[0]?.message?.content) {
      console.error('KIMI API响应格式错误:', data)
      throw new Error(apiMsg(locale, 'apiResponseInvalid'))
    }

    return data.choices[0].message.content.trim()
  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw new Error(apiMsg(locale, 'contentProcessTimeout'))
    }
    throw error
  }
}

// Mistral OCR pipeline for PDF.
async function processPdfWithMistral(file: string, filename: string, locale: AppLocale) {
  try {
    console.log('开始使用 Mistral OCR 处理 PDF...')
    
    // Mistral SDK client.
    const client = new Mistral({ apiKey: MISTRAL_API_KEY || '' });
    
    // Decode base64 payload to Buffer.
    const fileBuffer = Buffer.from(file, 'base64');
    
    // Upload to Mistral Files.
    console.log('上传文件到 Mistral...')
    let uploadData;
    try {
      uploadData = await client.files.upload({
        file: {
          fileName: filename,
          content: fileBuffer,
        },
        purpose: "ocr"
      });
      console.log('文件上传成功，ID:', uploadData.id);
    } catch (uploadError: any) {
      console.error('Mistral 文件上传错误:', uploadError);
      throw new Error(uploadError.message || apiMsg(locale, 'mistralUploadFailed'));
    }
    
    // Signed URL for OCR document_url input.
    console.log('获取签名 URL...');
    let signedUrlData;
    try {
      signedUrlData = await client.files.getSignedUrl({
        fileId: uploadData.id,
      });
      console.log('获取签名 URL 成功');
    } catch (signedUrlError: any) {
      console.error('获取签名 URL 错误:', signedUrlError);
      throw new Error(signedUrlError.message || apiMsg(locale, 'signedUrlFailed'));
    }
    
    // Run OCR on the signed document URL.
    console.log('开始 OCR 处理...');
    let ocrData: any;
    try {
      ocrData = await client.ocr.process({
        model: "mistral-ocr-latest",
        document: {
          type: "document_url",
          documentUrl: signedUrlData.url,
        }
      });
      console.log('OCR 处理完成，响应数据类型:', typeof ocrData);
      if (typeof ocrData === 'object' && ocrData !== null) {
        console.log('OCR 响应数据结构:', Object.keys(ocrData).join(', '));
        // Verbose debug logging of OCR payload shape.
        for (const key of Object.keys(ocrData)) {
          console.log(`OCR 响应字段 ${key} 类型:`, typeof ocrData[key]);
          if (key === 'pages' && Array.isArray(ocrData.pages)) {
            console.log('pages 数组长度:', ocrData.pages.length);
            if (ocrData.pages.length > 0) {
              console.log('第一页结构:', Object.keys(ocrData.pages[0]).join(', '));
            }
          }
        }
      }
      console.log('OCR 响应数据片段:', typeof ocrData === 'string' ? ocrData.substring(0, 500) : JSON.stringify(ocrData).substring(0, 500) + '...');
    } catch (ocrError: any) {
      console.error('Mistral OCR 错误:', ocrError);
      throw new Error(ocrError.message || apiMsg(locale, 'ocrProcessFailed'));
    }
    
    // Accumulate extracted text across pages/fields.
    let extractedText = '';
    
    // Guard empty OCR responses.
    if (!ocrData) {
      console.error('Mistral OCR 返回空响应');
      throw new Error(apiMsg(locale, 'ocrEmptyResponse'));
    }
    
    // Plain string response (markdown).
    if (typeof ocrData === 'string') {
      console.log('OCR 返回 Markdown 格式的文本');
      // Already markdown text.
      return ocrData.trim();
    }
    
    // Try common top-level fields.
    if (ocrData.markdown) {
      console.log('从 markdown 字段提取文本');
      return String(ocrData.markdown).trim();
    }
    
    // Fallback: text / content.
    if (ocrData.text) {
      console.log('从 text 字段提取文本');
      return String(ocrData.text).trim();
    }
    
    if (ocrData.content) {
      console.log('从 content 字段提取文本');
      return typeof ocrData.content === 'string' ? ocrData.content.trim() : JSON.stringify(ocrData.content);
    }
    
    // Nested result object variants.
    if (ocrData.result) {
      console.log('从 result 字段提取文本');
      if (typeof ocrData.result === 'string') {
        return ocrData.result.trim();
      } else if (typeof ocrData.result === 'object' && ocrData.result !== null) {
        // Known keys on result.
        if (ocrData.result.text) {
          return String(ocrData.result.text).trim();
        } else if (ocrData.result.content) {
          return typeof ocrData.result.content === 'string' ? ocrData.result.content.trim() : JSON.stringify(ocrData.result.content);
        } else {
          return JSON.stringify(ocrData.result);
        }
      }
    }
    
    // Page-array output (most common for Mistral OCR).
    if (ocrData.pages) {
      console.log(`发现 pages 字段，包含 ${Array.isArray(ocrData.pages) ? ocrData.pages.length : '未知数量'} 页`);
      
      // Concatenate per-page text.
      if (Array.isArray(ocrData.pages)) {
        console.log(`提取 ${ocrData.pages.length} 页的文本`);
        
        extractedText = ocrData.pages.map((page: any, index: number) => {
          if (!page) {
            console.log(`第 ${index + 1} 页为空`);
            return '';
          }
          
          // Prefer page.markdown (primary Mistral OCR output).
          if (page.markdown) {
            console.log(`从第 ${index + 1} 页的markdown字段提取文本`);
            return page.markdown;
          } else if (page.text) {
            return page.text;
          } else if (page.content) {
            return typeof page.content === 'string' ? page.content : JSON.stringify(page.content);
          } else {
            console.log(`第 ${index + 1} 页没有文本内容:`, page);
            return '';
          }
        }).join('\n\n');
      } else {
        console.error('Mistral OCR 响应中 pages 不是数组:', ocrData.pages);
        // Non-array pages: coerce to string/JSON.
        if (typeof ocrData.pages === 'string') {
          return ocrData.pages.trim();
        } else {
          return JSON.stringify(ocrData.pages);
        }
      }
    } else {
      console.log('OCR 响应中没有找到 pages 字段，尝试从整个响应中提取文本');
      // Last resort: stringify whole payload.
      return JSON.stringify(ocrData);
    }
    
    console.log(`提取的文本长度: ${extractedText.length} 字符`);
    
    // Avoid returning blank extraction silently.
    if (!extractedText || extractedText.trim() === '') {
      console.log('提取的文本为空，返回默认消息');
      return apiMsg(locale, 'pdfNoTextFallback');
    }
    
    return extractedText.trim();
  } catch (error: any) {
    console.error('Mistral OCR 处理错误:', error);
    if (error.name === 'AbortError') {
      throw new Error(apiMsg(locale, 'contentProcessTimeout'));
    }
    throw error;
  }
}

export async function POST(request: Request) {
  const locale = getRequestLocale(request)
  try {
    const auth = await requireAuth()
    if (!auth) return NextResponse.json({ error: apiMsg(locale, 'unauthenticated') }, { status: 401 })
    const quota = await checkAndRecordUsage(auth.userId, 'pdf', locale)
    if (!quota.allowed) return NextResponse.json({ error: quota.error }, { status: 403 })

    const { file, filename, service } = await request.json()

    if (!file) {
      return NextResponse.json(
        { error: apiMsg(locale, 'fileNotProvided') },
        { status: 400 }
      )
    }

    // Approximate decoded size from base64 length.
    const base64Size = file.length * 0.75 // ~bytes from base64 char count
    if (base64Size > 5 * 1024 * 1024) { // 5MB cap
      return NextResponse.json(
        { error: apiMsg(locale, 'fileSizeExceeded') },
        { status: 400 }
      )
    }

    if (service !== 'kimi' && service !== 'mistral') {
      return NextResponse.json(
        { error: apiMsg(locale, 'unsupportedService') },
        { status: 400 }
      )
    }

    if (service === 'kimi' && !KIMI_API_KEY) {
      return NextResponse.json(
        { error: apiMsg(locale, 'kimiNotConfigured') },
        { status: 500 }
      )
    }

    if (service === 'mistral' && !MISTRAL_API_KEY) {
      return NextResponse.json(
        { error: apiMsg(locale, 'mistralNotConfigured') },
        { status: 500 }
      )
    }

    // Run selected backend.
    try {
      let result = ''
      
      if (service === 'kimi') {
        // Kimi multi-step flow.
        console.log('开始使用 Kimi API 处理...')
        // Step 1: upload
        console.log('开始上传文件...')
        const fileObject = await uploadFile(file, filename, locale)
        
        // Step 2: download content
        console.log('开始获取文件内容...')
        const fileContent = await getFileContent(fileObject.id, locale)
        
        // Step 3: LLM extract
        console.log('开始处理文件内容...')
        result = await processContent(fileContent, locale)
      } else if (service === 'mistral') {
        // Mistral OCR path
        console.log('开始使用 Mistral OCR API 处理...')
        result = await processPdfWithMistral(file, filename, locale)
      }

      // Guard huge JSON payloads in the response.
      if (result.length > 5 * 1024 * 1024) { // 5MB
        throw new Error(apiMsg(locale, 'responseTooLarge'))
      }

      return NextResponse.json({ text: result })
    } catch (error: any) {
      console.error('处理步骤错误:', error)
      const msg = String(error?.message || '')
      if (error.name === 'AbortError' || /timeout|超时/i.test(msg)) {
        return NextResponse.json(
          { error: apiMsg(locale, 'processingTimeout') },
          { status: 503 }
        )
      }
      
      // Map certain errors to 413.
      if (msg === apiMsg(locale, 'fileSizeExceeded') || msg === apiMsg(locale, 'responseTooLarge')) {
        return NextResponse.json(
          { error: msg },
          { status: 413 }
        )
      }
      
      return NextResponse.json(
        { error: error.message || apiMsg(locale, 'pdfExtractFailed') },
        { status: 500 }
      )
    }
  } catch (error: any) {
    console.error('PDF处理错误:', error)
    return NextResponse.json(
      { error: error.message || apiMsg(locale, 'pdfExtractFailed') },
      { status: error.status || 500 }
    )
  }
}