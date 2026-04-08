'use client'

import { Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ChatMessageProps {
  role: 'user' | 'mia'
  content: string
  timestamp?: Date
  streaming?: boolean
  agentsReferenced?: string[]
  onActionClick?: (skillId: string) => void
}

// Parse [ACTION:skill-id] tags from Mia's messages
function parseContent(
  content: string,
  onActionClick?: (skillId: string) => void,
): React.ReactNode[] {
  const parts = content.split(/(\[ACTION:[^\]]+\])/g)
  return parts.map((part, i) => {
    const match = part.match(/^\[ACTION:([^\]]+)\]$/)
    if (match) {
      const skillId = match[1] ?? ''
      return (
        <button
          key={i}
          onClick={() => onActionClick && onActionClick(skillId)}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium
            bg-[#6366f1]/20 text-[#6366f1] border border-[#6366f1]/30
            hover:bg-[#6366f1]/30 transition-colors duration-150 cursor-pointer ml-1"
        >
          <Sparkles className="h-3 w-3" aria-hidden="true" />
          {skillId}
        </button>
      )
    }
    return <span key={i}>{part}</span>
  })
}

export function ChatMessage({
  role,
  content,
  timestamp,
  streaming = false,
  onActionClick,
}: ChatMessageProps) {
  const isUser = role === 'user'

  return (
    <div
      className={cn(
        'flex gap-3 animate-fade-in',
        isUser ? 'flex-row-reverse' : 'flex-row',
      )}
    >
      {/* Mia avatar */}
      {!isUser && (
        <div className="shrink-0 flex h-8 w-8 items-center justify-center rounded-full bg-[#6366f1]/20 border border-[#6366f1]/20 mt-1">
          <Sparkles className="h-4 w-4 text-[#6366f1]" aria-hidden="true" />
        </div>
      )}

      {/* Bubble */}
      <div
        className={cn(
          'max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed',
          isUser
            ? 'bg-white/[0.06] text-foreground rounded-br-sm border border-white/[0.08]'
            : 'glass-panel text-foreground rounded-bl-sm glow-mia',
        )}
      >
        {streaming && !content ? (
          /* Pulsing dots while Mia is thinking */
          <span className="flex items-center gap-1.5" aria-label="Mia is typing">
            <span className="h-1.5 w-1.5 rounded-full bg-[#6366f1] animate-bounce [animation-delay:0ms]" />
            <span className="h-1.5 w-1.5 rounded-full bg-[#6366f1] animate-bounce [animation-delay:150ms]" />
            <span className="h-1.5 w-1.5 rounded-full bg-[#6366f1] animate-bounce [animation-delay:300ms]" />
          </span>
        ) : (
          <p className="whitespace-pre-wrap break-words">
            {isUser ? content : parseContent(content, onActionClick)}
            {streaming && (
              <span className="inline-block ml-0.5 h-4 w-0.5 bg-[#6366f1] animate-pulse" aria-hidden="true" />
            )}
          </p>
        )}

        {timestamp && (
          <p className="mt-1.5 text-[10px] text-muted-foreground/60 select-none">
            {timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
      </div>
    </div>
  )
}
