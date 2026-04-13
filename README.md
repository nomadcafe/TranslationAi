# Translation AI

An AI-powered multilingual translation and content processing platform.

**README in other languages:** [简体中文](README.zh.md) · [日本語](README.ja.md) · [Español](README.es.md)

## Features

### 1. Multimodal translation
- **Text translation**: High-volume text translation across many languages
- **Image OCR & translation**: Extract and translate text from images in common formats
- **PDF**: Extract text from PDFs and translate with layout-friendly pipelines
- **Speech**: Speech-to-text and translation workflows
- **Video**: Extract on-screen text / subtitles and related processing (provider-dependent)

### 2. AI models
- Multiple backends (e.g. DeepSeek, Qwen, Gemini, Z.AI, Tencent Hunyuan, OpenAI, Kimi, StepFun AI, Mistral, Claude, SiliconFlow, and more)
- Fallback behavior when a primary provider errors
- Server-side API keys only (never `NEXT_PUBLIC_*` for secrets)

### 3. Subscriptions
- Tiers: trial, monthly, yearly (via **Stripe**)
- Per-feature quotas by tier
- Subscription status and renewal handled in-app

### 4. Accounts
- Email + password (bcrypt)
- OAuth: **GitHub** and **Google** (NextAuth)
- Profile basics and usage summaries

### 5. Quotas
- **Free**: image / PDF / speech / video quotas reset on a **calendar-month** basis (1st of month)
- **Paid**: same dimensions reset **daily** (midnight)
- UI shows remaining usage for the current period

**Example limits (see product config for truth):**

| Tier | Text | Image / mo or day | PDF | Speech | Video |
|------|------|-------------------|-----|--------|-------|
| Trial | Unlimited | 5 / month | 3 / month | 2 / month | 1 / month |
| Monthly | Unlimited | 50 / day | 40 / day | 30 / day | 10 / day |
| Yearly | Unlimited | 100 / day | 80 / day | 60 / day | 20 / day |

### 6. UX & i18n
- Responsive layout (Tailwind)
- UI locales: **English**, **Chinese**, **Japanese**, **Spanish** (plus API message bundles)
- PDF pipeline optimizations (multiple extract paths, retries tuned for latency)

## Tech stack

- **Frontend**: Next.js 14, React, TypeScript, Tailwind CSS
- **Backend**: Node.js, PostgreSQL via **Neon** (`@neondatabase/serverless`) or any compatible `DATABASE_URL`
- **Auth**: NextAuth.js
- **Payments**: Stripe
- **i18n**: JSON locale files + `X-App-Locale` for API errors
- **Cloud / vendors**: Alibaba Cloud OSS (video upload path), Tencent Cloud (some AI/OCR), plus various model HTTP APIs

## Environment variables

Copy `.env.example` to `.env.local` and fill in values. Production canonical URL is **https://translation.ai** — set `NEXTAUTH_URL` and `NEXT_PUBLIC_APP_URL` to that origin on Vercel (use `http://localhost:3000` locally).

```env
# Database
DATABASE_URL=

# Auth
NEXTAUTH_SECRET=
NEXTAUTH_URL=

# GitHub OAuth
GITHUB_ID=
GITHUB_SECRET=

# Google OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Stripe
STRIPE_SECRET_KEY=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_MONTHLY_PRICE_ID=
NEXT_PUBLIC_STRIPE_YEARLY_PRICE_ID=
NEXT_PUBLIC_APP_URL=https://translation.ai

# Alibaba Cloud (OSS / video OCR, etc.)
ALIYUN_ACCESS_KEY_ID=
ALIYUN_ACCESS_KEY_SECRET=
ALIYUN_OSS_BUCKET=
ALIYUN_OSS_REGION=
ALIYUN_RAM_ROLE_ARN=

# AI API keys (server-only — do not prefix with NEXT_PUBLIC_)
GEMINI_API_KEY=
DEEPSEEK_API_KEY=
QWEN_API_KEY=
ZHIPU_API_KEY=
TENCENT_API_KEY=
KIMI_API_KEY=
OPENAI_API_KEY=
MINIMAX_API_KEY=
SILICONFLOW_API_KEY=
ANTHROPIC_API_KEY=
STEP_API_KEY=
MISTRAL_API_KEY=
```

## Scripts

```bash
npm install
npm run dev          # development server
npm run build        # production build
npm run migrate      # database migrations (requires DATABASE_URL)
```
