import { apiFetch } from '@/lib/api-fetch'

/** Browser-only helpers: POST to `/api/translate` (and related routes). No API keys in the bundle. */

export async function translateWithDeepSeek(text: string, targetLanguage: string) {
  try {
    const response = await apiFetch('/api/translate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: text.trim(),
        targetLanguage,
        service: 'deepseek',
      }),
    })

    if (!response.ok) {
      const result = await response.json()
      throw new Error(result.error || '翻译请求失败')
    }

    const result = await response.json()

    if (!result.text) {
      throw new Error('翻译结果为空')
    }

    return result.text.trim()
  } catch (error: any) {
    console.error('DeepSeek translation error:', error)
    throw error
  }
}

export async function translateWithQwen(text: string, targetLanguage: string) {
  try {
    const response = await apiFetch('/api/translate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: text.trim(),
        targetLanguage,
        service: 'qwen',
      }),
    })

    const result = await response.json()

    if (!response.ok) {
      throw new Error(result.error || '翻译请求失败')
    }

    if (!result.text) {
      throw new Error('翻译结果为空')
    }

    return result.text.trim()
  } catch (error: any) {
    console.error('Qwen translation error:', error)
    throw new Error(error.message || '翻译失败，请稍后重试')
  }
}

export async function translateWithZhipu(text: string, targetLanguage: string) {
  try {
    const response = await apiFetch('/api/translate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: text.trim(),
        targetLanguage,
        service: 'zhipu',
      }),
    })

    const result = await response.json()

    if (!response.ok) {
      throw new Error(result.error || '翻译请求失败')
    }

    if (!result.text) {
      throw new Error('翻译结果为空')
    }

    return result.text.trim()
  } catch (error: any) {
    console.error('Z.AI translation error:', error)
    throw new Error(error.message || '翻译失败，请稍后重试')
  }
}

export async function translateWithHunyuan(text: string, targetLang: string) {
  try {
    const response = await apiFetch('/api/translate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: text.trim(),
        targetLanguage: targetLang,
        service: 'hunyuan',
      }),
    })

    const result = await response.json()

    if (!response.ok) {
      throw new Error(result.error || '翻译请求失败')
    }

    if (!result.text) {
      throw new Error('翻译结果为空')
    }

    return result.text.trim()
  } catch (error: any) {
    console.error('Error translating with Hunyuan:', error)
    throw new Error(error.message || '翻译失败，请稍后重试')
  }
}

export async function translateWith4oMini(text: string, targetLanguage: string) {
  try {
    const response = await apiFetch('/api/translate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: text.trim(),
        targetLanguage,
        service: '4o-mini',
      }),
    })

    const result = await response.json()

    if (!response.ok) {
      throw new Error(result.error || '翻译请求失败')
    }

    if (!result.text) {
      throw new Error('翻译结果为空')
    }

    return result.text.trim()
  } catch (error: any) {
    console.error('OpenAI translation error:', error)
    throw new Error(error.message || '翻译失败，请稍后重试')
  }
}

export async function translateWithMinimax(text: string, targetLanguage: string) {
  try {
    const response = await apiFetch('/api/translate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: text.trim(),
        targetLanguage,
        service: 'minimax',
      }),
    })

    const result = await response.json()

    if (!response.ok) {
      throw new Error(result.error || '翻译请求失败')
    }

    if (!result.text) {
      throw new Error('翻译结果为空')
    }

    return result.text.trim()
  } catch (error: any) {
    console.error('MiniMax translation error:', error)
    throw new Error(error.message || '翻译失败，请稍后重试')
  }
}

export async function translateWithSiliconFlow(text: string, targetLanguage: string) {
  try {
    const response = await apiFetch('/api/translate/siliconflow', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: text.trim(),
        targetLanguage,
      }),
    })

    const result = await response.json()

    if (!response.ok) {
      throw new Error(result.error || '翻译请求失败')
    }

    if (!result.text) {
      throw new Error('翻译结果为空')
    }

    return result.text.trim()
  } catch (error: any) {
    console.error('SiliconFlow translation error:', error)
    throw new Error(error.message || '翻译失败，请稍后重试')
  }
}

export async function translateWithClaude(text: string, targetLanguage: string) {
  try {
    const response = await apiFetch('/api/translate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: text.trim(),
        targetLanguage,
        service: 'claude',
      }),
    })

    const result = await response.json()

    if (!response.ok) {
      throw new Error(result.error || '翻译请求失败')
    }

    if (!result.text) {
      throw new Error('翻译结果为空')
    }

    return result.text.trim()
  } catch (error: any) {
    console.error('Claude translation error:', error)
    throw new Error(error.message || '翻译失败，请稍后重试')
  }
}

export async function translateWithGemini(text: string, targetLanguage: string) {
  const response = await apiFetch('/api/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: text.trim(), targetLanguage, service: 'gemini' }),
  })
  if (!response.ok) {
    const result = await response.json()
    throw new Error(result.error || '翻译请求失败')
  }
  const result = await response.json()
  if (!result.text) throw new Error('翻译结果为空')
  return result.text.trim()
}

export async function translateWithStepAPI(text: string, targetLanguage: string) {
  try {
    const response = await apiFetch('/api/translate/step', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: text.trim(),
        targetLanguage,
      }),
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const data = await response.json()
    if (!data.translation) {
      throw new Error('No translation result')
    }

    return data.translation
  } catch (error: any) {
    console.error('StepFun translation error:', error)
    throw new Error(error.message || 'Translation failed')
  }
}
