'use client'

import { useState, useCallback } from 'react'
import { Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface ResultBlockProps {
  title: string
  text: string
  className?: string
  /** When true the text streams in character-by-character; shows a blinking cursor. */
  streaming?: boolean
}

export function ResultBlock({ title, text, className, streaming }: ResultBlockProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [text])

  return (
    <div className={cn('w-full max-w-2xl mx-auto p-4 bg-gray-100 dark:bg-gray-800 rounded-lg', className)}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-medium text-sm sm:text-base">{title}</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          disabled={!text}
          className="h-7 px-2 text-muted-foreground hover:text-foreground"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-green-500" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
          <span className="ml-1 text-xs">{copied ? 'Copied' : 'Copy'}</span>
        </Button>
      </div>
      <p className="whitespace-pre-wrap text-sm sm:text-base">
        {text}
        {streaming && text && (
          <span className="inline-block w-0.5 h-4 bg-current align-middle ml-0.5 animate-pulse" />
        )}
      </p>
    </div>
  )
}
