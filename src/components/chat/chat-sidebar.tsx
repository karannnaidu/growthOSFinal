'use client'

import { Plus, Sparkles, Search, BarChart3, Paintbrush, Stethoscope, DollarSign } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Conversation {
  id: string
  title: string
  created_at: string
}

interface ChatSidebarProps {
  conversations: Conversation[]
  activeId: string | null
  onSelect: (id: string) => void
  onNew: () => void
}

const AGENT_SHORTCUTS = [
  { id: 'scout', label: 'Intelligence Hub', icon: Search, color: '#0D9488' },
  { id: 'aria', label: 'Aria Creative', icon: Paintbrush, color: '#F97316' },
  { id: 'scout-diag', label: 'Scout Diagnosis', icon: Stethoscope, color: '#0D9488' },
  { id: 'max', label: 'Max Budget', icon: DollarSign, color: '#3B82F6' },
]

export function ChatSidebar({ conversations, activeId, onSelect, onNew }: ChatSidebarProps) {
  return (
    <aside className="flex w-64 flex-col glass-panel border-r border-white/[0.06] overflow-hidden shrink-0">
      {/* Header */}
      <div className="px-4 py-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-2 mb-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#6366f1]/20">
            <Sparkles className="h-3.5 w-3.5 text-[#6366f1]" aria-hidden="true" />
          </div>
          <span className="text-sm font-heading font-bold text-foreground">Mia Engine</span>
        </div>
        <button
          onClick={onNew}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-medium
            bg-[#6366f1] text-white hover:bg-[#6366f1]/90 active:scale-[0.98]
            transition-all duration-150"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          New Initiative
        </button>
      </div>

      {/* Agent shortcuts */}
      <div className="px-3 py-3 border-b border-white/[0.06]">
        <p className="px-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
          Quick Access
        </p>
        <div className="space-y-0.5">
          {AGENT_SHORTCUTS.map((shortcut) => {
            const Icon = shortcut.icon
            return (
              <button
                key={shortcut.id}
                onClick={onNew}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs text-muted-foreground
                  hover:bg-white/[0.06] hover:text-foreground transition-colors duration-150"
              >
                <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: shortcut.color }} aria-hidden="true" />
                {shortcut.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Conversation history */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        <p className="px-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
          History
        </p>
        {conversations.length === 0 ? (
          <p className="px-2 py-3 text-xs text-muted-foreground/50 text-center">
            No conversations yet
          </p>
        ) : (
          <div className="space-y-0.5">
            {conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => onSelect(conv.id)}
                className={cn(
                  'w-full text-left px-2.5 py-2 rounded-lg text-xs transition-colors duration-150 truncate',
                  activeId === conv.id
                    ? 'bg-[#6366f1]/15 text-[#6366f1]'
                    : 'text-muted-foreground hover:bg-white/[0.06] hover:text-foreground',
                )}
              >
                {conv.title || 'Untitled conversation'}
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  )
}
