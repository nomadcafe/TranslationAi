import './globals.css';
import { Inter } from 'next/font/google';
import { Providers } from "./providers";
import GoogleAnalytics from '@/components/google-analytics';
import { LanguageProvider } from "@/components/language-provider";
import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { getSiteUrl } from '@/lib/site';

const inter = Inter({ subsets: ['latin'] });

const siteUrl = getSiteUrl();

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    template: '%s | Translation Ai',
    default: 'Translation Ai - Smart Multilingual Translation Platform',
  },
  description: 'All-in-one intelligent translation solution supporting text, image, PDF, speech, and video translation, making cross-language communication simpler.',
  keywords: ['AI Translation', 'Multilingual Translation', 'Image Translation', 'PDF Translation', 'Speech Translation', 'Video Translation', 'Machine Translation'],
  authors: [{ name: 'Translation Ai Team' }],
  creator: 'Translation Ai Team',
  publisher: 'Translation Ai',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  manifest: '/site.webmanifest',
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: '/',
    title: 'Translation Ai - Smart Multilingual Translation Platform',
    description: 'All-in-one intelligent translation solution supporting text, image, PDF, speech, and video translation, making cross-language communication simpler.',
    siteName: 'Translation Ai',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Translation Ai',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Translation Ai - Smart Multilingual Translation Platform',
    description: 'All-in-one intelligent translation solution supporting text, image, PDF, speech, and video translation, making cross-language communication simpler.',
    images: ['/og-image.png'],
  },
  verification: {
    google: 'yLQ9THm_U56rW0n0VsGzM6IXvWmlbS3fV7NGl-SZT3k',
  },
};

function htmlLangFromHeader(locale: string | null): string {
  if (locale === 'zh') return 'zh-CN';
  if (locale === 'ja') return 'ja';
  if (locale === 'es') return 'es';
  return 'en';
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headerStore = await headers();
  const headerLocale = headerStore.get('x-next-locale');
  const htmlLang = htmlLangFromHeader(headerLocale);
  const base = getSiteUrl();
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${base}/#organization`,
        name: 'Translation Ai',
        url: base,
        logo: `${base}/og-image.png`,
      },
      {
        '@type': 'WebSite',
        '@id': `${base}/#website`,
        url: base,
        name: 'Translation Ai',
        inLanguage: 'en',
        publisher: { '@id': `${base}/#organization` },
      },
    ],
  };

  return (
    <html lang={htmlLang} suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/site.webmanifest" />
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" href="/favicon-16x16.png" type="image/png" sizes="16x16" />
        <link rel="icon" href="/favicon-32x32.png" type="image/png" sizes="32x32" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      </head>
      <body className={inter.className}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <LanguageProvider>
          <Providers>
            <GoogleAnalytics />
            {children}
          </Providers>
        </LanguageProvider>
      </body>
    </html>
  );
}