import OpenAI from 'openai';
import { NextResponse } from 'next/server';
import { sign } from '@/lib/server/tencent-sign';
import { requireAuth } from '@/lib/server/require-auth';
import { getRequestLocale, apiMsg } from '@/lib/server/request-i18n';
import { getKimiApiBaseUrl } from '@/lib/server/kimi-api-base';
import { ZHIPU_PAAS_BASE } from '@/lib/server/zhipu-api-base';
import { ZHIPU_TEXT_MODEL } from '@/lib/server/zhipu';
import { getQwenCompatibleBaseUrl } from '@/lib/server/qwen-api-base';
import {
  getMinimaxApiKey,
  getMinimaxChatModel,
  getMinimaxOpenAiBaseUrl,
} from '@/lib/server/minimax-api-base';
import { translateWithAnthropicClaude } from '@/lib/server/anthropic-claude';

const MAX_TEXT_CHARS = 10_000

export async function POST(request: Request) {
  const locale = getRequestLocale(request);
  try {
    const auth = await requireAuth();
    if (!auth) {
      return NextResponse.json({ error: apiMsg(locale, 'unauthenticated') }, { status: 401 });
    }

    const { text, targetLanguage, service } = await request.json();

    if (!text || !targetLanguage) {
      return NextResponse.json({ error: apiMsg(locale, 'missingParams') }, { status: 400 });
    }

    if (typeof text !== 'string' || text.length > MAX_TEXT_CHARS) {
      return NextResponse.json({ error: apiMsg(locale, 'textTooLong') }, { status: 400 });
    }

    let translatedText;

    try {
      switch (service) {
        case 'deepseek':
          translatedText = await translateWithDeepSeekAPI(text, targetLanguage);
          break;
        case 'qwen':
          translatedText = await translateWithQwenAPI(text, targetLanguage);
          break;
        case 'zhipu':
          translatedText = await translateWithZhipuAPI(text, targetLanguage);
          break;
        case '4o-mini':
          translatedText = await translateWith4oMiniAPI(text, targetLanguage);
          break;
        case 'hunyuan':
          translatedText = await translateWithHunyuanAPI(text, targetLanguage);
          break;
        case 'minimax':
          translatedText = await translateWithMinimaxAPI(text, targetLanguage);
          break;
        case 'siliconflow':
          translatedText = await translateWithSiliconFlowAPI(text, targetLanguage);
          break;
        case 'claude':
        case 'claude_3_5':
          translatedText = await translateWithClaudeAPI(text, targetLanguage);
          break;
        case 'kimi':
          translatedText = await translateWithKimiAPI(text, targetLanguage);
          break;
        case 'gemini':
          translatedText = await translateWithGeminiAPI(text, targetLanguage);
          break;
        case 'step':
          translatedText = await translateWithStepAPI(text, targetLanguage);
          break;
        default:
          translatedText = await translateWithDeepSeekAPI(text, targetLanguage);
      }
    } catch (serviceError: any) {
      console.error(`${service} translation service error:`, serviceError);
      // Fallback to DeepSeek when the primary translator errors.
      if (service !== 'deepseek') {
        console.log('Trying DeepSeek as fallback service...');
        translatedText = await translateWithDeepSeekAPI(text, targetLanguage);
      } else {
        throw serviceError;
      }
    }

    return NextResponse.json({ text: translatedText });
  } catch (error: any) {
    console.error('Translation error:', error);
    return NextResponse.json({ error: error.message || apiMsg(locale, 'translateFailed') }, { status: 500 });
  }
}

async function translateWithDeepSeekAPI(text: string, targetLanguage: string) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error('DeepSeek API key not found');
  }

  const openai = new OpenAI({
    apiKey: apiKey,
    baseURL: 'https://api.deepseek.com/v1'
  });

  const response = await openai.chat.completions.create({
    model: 'deepseek-chat',
    messages: [
      {
        role: 'system',
        content: `You are a professional translator. Translate the following text to ${targetLanguage}. Only return the translated text, no explanations.`
      },
      {
        role: 'user',
        content: text
      }
    ],
    temperature: 0.3,
    max_tokens: 2000
  });

  return response.choices[0].message.content || '';
}

async function translateWithQwenAPI(text: string, targetLanguage: string) {
  const apiKey = process.env.QWEN_API_KEY;
  if (!apiKey) {
    throw new Error('Qwen API key not found');
  }

  const openai = new OpenAI({
    apiKey: apiKey,
    baseURL: getQwenCompatibleBaseUrl(),
  });

  const response = await openai.chat.completions.create({
    model: 'qwen-max',
    messages: [
      {
        role: 'system',
        content: `You are a professional translator. Translate the following text to ${targetLanguage}. Only return the translated text, no explanations.`
      },
      {
        role: 'user',
        content: text
      }
    ],
    temperature: 0.3,
    max_tokens: 2000
  });

  return response.choices[0].message.content || '';
}

async function translateWithZhipuAPI(text: string, targetLanguage: string) {
  const apiKey = process.env.ZHIPU_API_KEY;
  if (!apiKey) {
    throw new Error('Z.AI API key not found');
  }

  const openai = new OpenAI({
    apiKey: apiKey,
    baseURL: ZHIPU_PAAS_BASE,
  });

  const response = await openai.chat.completions.create({
    model: ZHIPU_TEXT_MODEL,
    messages: [
      {
        role: 'system',
        content: `You are a professional translator. Translate the following text to ${targetLanguage}. Only return the translated text, no explanations.`
      },
      {
        role: 'user',
        content: text
      }
    ],
    temperature: 0.3,
    max_tokens: 2000
  });

  return response.choices[0].message.content || '';
}

async function translateWith4oMiniAPI(text: string, targetLanguage: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OpenAI API key not found');
  }

  const openai = new OpenAI({
    apiKey: apiKey,
    baseURL: 'https://api.openai.com/v1'
  });

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `You are a professional translator. Translate the following text to ${targetLanguage}. Only return the translated text, no explanations.`
      },
      {
        role: 'user',
        content: text
      }
    ],
    temperature: 0.3,
    max_tokens: 2000
  });

  return response.choices[0].message.content || '';
}

async function translateWithHunyuanAPI(text: string, targetLanguage: string) {
  const apiKey = process.env.TENCENT_API_KEY;
  if (!apiKey) {
    throw new Error('Tencent API key not found');
  }

  const openai = new OpenAI({
    apiKey: apiKey,
    baseURL: 'https://api.hunyuan.cloud.tencent.com/v1'
  });

  const response = await openai.chat.completions.create({
    model: 'hunyuan-turbo',
    messages: [
      {
        role: 'system',
        content: `你是一个专业的翻译助手，请直接翻译文本，不要添加任何解释。`
      },
      {
        role: 'user',
        content: `将以下文本翻译成${targetLanguage}：\n\n${text}`
      }
    ],
    temperature: 0.1,
    top_p: 0.7,
    // @ts-expect-error key is not yet public
    enable_enhancement: true
  });

  return response.choices[0].message.content || '';
}

async function translateWithMinimaxAPI(text: string, targetLanguage: string) {
  const apiKey = getMinimaxApiKey();
  if (!apiKey) {
    throw new Error('MiniMax API key not found');
  }

  const openai = new OpenAI({
    apiKey,
    baseURL: getMinimaxOpenAiBaseUrl(),
  });

  try {
    const completion = await openai.chat.completions.create({
      model: getMinimaxChatModel(),
      messages: [
        {
          role: 'system',
          content: 'You are a professional translator. Translate the text directly without any explanations.'
        },
        {
          role: 'user',
          content: `Translate to ${targetLanguage}:\n${text}`
        }
      ],
      temperature: 0.3,
      max_tokens: 2000,
    });

    return completion.choices[0].message.content;
  } catch (error: any) {
    console.error('MiniMax translation error:', error);
    throw new Error(error.message || '翻译失败');
  }
}

async function translateWithSiliconFlowAPI(text: string, targetLanguage: string) {
  const apiKey = process.env.SILICONFLOW_API_KEY;
  if (!apiKey) {
    throw new Error('SiliconFlow API key not found');
  }

  const openai = new OpenAI({
    apiKey: apiKey,
    baseURL: 'https://api.siliconflow.com/v1'
  });

  try {
    const completion = await openai.chat.completions.create({
      model: 'meta-llama/Llama-3.3-70B-Instruct',
      messages: [
        {
          role: 'system',
          content: 'You are a professional translator. Translate the text directly without any explanations.'
        },
        {
          role: 'user',
          content: `Translate to ${targetLanguage}:\n${text}`
        }
      ],
      temperature: 0.3,
      max_tokens: 2000,
    });

    return completion.choices[0].message.content;
  } catch (error: any) {
    console.error('SiliconFlow translation error:', error);
    throw new Error(error.message || '翻译失败');
  }
}

async function translateWithClaudeAPI(text: string, targetLanguage: string) {
  return translateWithAnthropicClaude(
    text,
    targetLanguage,
    'You are a professional translator. Translate the text directly without any explanations.'
  );
}

async function translateWithKimiAPI(text: string, targetLanguage: string) {
  const apiKey = process.env.KIMI_API_KEY;
  if (!apiKey) throw new Error('Kimi API key not found');
  const openai = new OpenAI({ apiKey, baseURL: getKimiApiBaseUrl() });
  const completion = await openai.chat.completions.create({
    model: 'moonshot-v1-128k',
    messages: [
      { role: 'system', content: `You are a professional translator. Translate the following text to ${targetLanguage}. Keep the original format and style.` },
      { role: 'user', content: text }
    ],
    temperature: 0.3,
    max_tokens: 2000
  });
  const t = completion.choices[0]?.message?.content;
  if (!t) throw new Error('No translation result');
  return t;
}

async function translateWithGeminiAPI(text: string, targetLanguage: string) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('Gemini API key not found');
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
  // Send the whole text in a single request instead of one call per paragraph.
  const result = await model.generateContent([
    `Translate the following text to ${targetLanguage}. Return only the translated text, preserving paragraphs and line breaks:`,
    text,
  ]);
  const response = await result.response;
  return response.text().trim();
}

async function translateWithStepAPI(text: string, targetLanguage: string) {
  const apiKey = process.env.STEP_API_KEY;
  if (!apiKey) {
    throw new Error('StepFun API key not found');
  }

  const openai = new OpenAI({
    apiKey: apiKey,
    baseURL: 'https://api.stepfun.ai/v1'
  });

  const response = await openai.chat.completions.create({
    model: 'step-2-16k',
    messages: [
      {
        role: 'system',
        content: `You are a professional translator. Translate the following text to ${targetLanguage}. Only return the translated text, no explanations.`
      },
      {
        role: 'user',
        content: text
      }
    ],
    temperature: 0.3,
    max_tokens: 2000
  });

  return response.choices[0].message.content || '';
} 