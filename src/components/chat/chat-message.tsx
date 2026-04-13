'use client'

import { useEffect } from 'react'
import { Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { RichAgentCard } from '@/components/chat/rich-agent-card'
import { AGENTS } from '@/lib/agents-data'
import { parseMiaResponse, type MiaAction } from '@/lib/mia-actions'

interface ChatMessageProps {
  role: 'user' | 'mia'
  content: string
  timestamp?: Date
  streaming?: boolean
  agentsReferenced?: string[]
  onActionClick?: (skillId: string) => void
  onActionsFound?: (actions: MiaAction[]) => void
}

// Agent names for detection (lowercase -> agentId)
const AGENT_NAME_MAP: Record<string, string> = Object.fromEntries(
  AGENTS.map((a) => [a.name.toLowerCase(), a.id]),
)

// Parse [AGENT:hugo|metric1=val1|finding1] patterns
function parseAgentTag(tag: string): { agentId: string; metrics?: Record<string, string>; findings?: string[] } | null {
  const inner = tag.slice(7, -1) // Remove [AGENT: and ]
  const parts = inner.split('|')
  const agentId = parts[0]?.trim().toLowerCase()
  if (!agentId) return null

  const metrics: Record<string, string> = {}
  const findings: string[] = []

  for (let i = 1; i < parts.length; i++) {
    const part = parts[i]?.trim()
    if (!part) continue
    if (part.includes('=')) {
      const [key, val] = part.split('=', 2)
      if (key && val) metrics[key.trim()] = val.trim()
    } else {
      findings.push(part)
    }
  }

  return { agentId, metrics: Object.keys(metrics).length > 0 ? metrics : undefined, findings: findings.length > 0 ? findings : undefined }
}

// Parse [ACTION:skill-id] and [AGENT:...] tags from Mia's messages
function parseContent(
  content: string,
  onActionClick?: (skillId: string) => void,
): React.ReactNode[] {
  // Split on both ACTION and AGENT tags
  const parts = content.split(/(\[ACTION:[^\]]+\]|\[AGENT:[^\]]+\])/g)
  return parts.map((part, i) => {
    // Handle ACTION tags
    const actionMatch = part.match(/^\[ACTION:([^\]]+)\]$/)
    if (actionMatch) {
      const skillId = actionMatch[1] ?? ''
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

    // Handle AGENT tags
    const agentMatch = part.match(/^\[AGENT:[^\]]+\]$/)
    if (agentMatch) {
      const parsed = parseAgentTag(part)
      if (parsed) {
        return (
          <RichAgentCard
            key={i}
            agentId={parsed.agentId}
            metrics={parsed.metrics}
            findings={parsed.findings}
          />
        )
      }
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
  onActionsFound,
}: ChatMessageProps) {
  const isUser = role === 'user'

  // Parse and strip action blocks from Mia's messages
  const { text: displayText, actions: parsedActions } = role === 'mia' && !streaming
    ? parseMiaResponse(content)
    : { text: content, actions: [] as MiaAction[] }

  // Notify parent of parsed actions (on first parse)
  useEffect(() => {
    if (parsedActions.length > 0 && onActionsFound) {
      onActionsFound(parsedActions)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content])

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
            {isUser ? content : parseContent(displayText, onActionClick)}
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
