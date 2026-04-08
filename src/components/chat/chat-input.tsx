'use client'

import { useRef, useCallback } from 'react'
import { Send } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ChatInputProps {
  onSend: (message: string) => void
  disabled?: boolean
  value: string
  onChange: (value: string) => void
}

export function ChatInput({ onSend, disabled = false, value, onChange }: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSend = useCallback(() => {
    const trimmed = value.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    onChange('')
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [value, disabled, onSend, onChange])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend],
  )

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange(e.target.value)
      // Auto-resize
      const el = e.target
      el.style.height = 'auto'
      el.style.height = `${Math.min(el.scrollHeight, 160)}px`
    },
    [onChange],
  )

  const canSend = value.trim().length > 0 && !disabled

  return (
    <div className="glass-panel border-t border-white/[0.06] px-4 py-3">
      <div className="flex items-end gap-3">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          rows={1}
          placeholder="Ask Mia anything about your brand..."
          className={cn(
            'flex-1 resize-none rounded-xl bg-white/[0.04] border border-white/[0.08]',
            'px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50',
            'focus:outline-none focus:border-[#6366f1]/40 focus:ring-1 focus:ring-[#6366f1]/20',
            'transition-colors duration-150 max-h-40 min-h-[42px]',
            'disabled:opacity-50 disabled:cursor-not-allowed',
          )}
          style={{ height: 'auto' }}
          aria-label="Message to Mia"
        />
        <button
          onClick={handleSend}
          disabled={!canSend}
          aria-label="Send message"
          className={cn(
            'shrink-0 flex h-[42px] w-[42px] items-center justify-center rounded-xl',
            'transition-all duration-150',
            canSend
              ? 'bg-[#6366f1] text-white hover:bg-[#6366f1]/90 active:scale-95'
              : 'bg-white/[0.04] text-muted-foreground/40 cursor-not-allowed',
          )}
        >
          <Send className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground/40 select-none">
        Enter to send · Shift+Enter for new line
      </p>
    </div>
  )
}
