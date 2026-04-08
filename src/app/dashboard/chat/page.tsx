'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Sparkles, MessageSquare, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { ChatMessage } from '@/components/chat/chat-message'
import { ChatInput } from '@/components/chat/chat-input'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Message {
  id: string
  role: 'user' | 'mia'
  content: string
  timestamp: Date
  streaming?: boolean
}

interface Conversation {
  id: string
  title: string
  created_at: string
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ChatPage() {
  const [brandId, setBrandId] = useState<string | null>(null)
  const [brandName, setBrandName] = useState<string>('')
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  // Auto-scroll when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Load brand and conversations on mount
  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Resolve brand
      let resolvedBrandId: string | null = null
      let resolvedBrandName = ''

      const { data: ownedBrand } = await supabase
        .from('brands')
        .select('id, name')
        .eq('owner_id', user.id)
        .limit(1)
        .single()

      if (ownedBrand) {
        resolvedBrandId = ownedBrand.id as string
        resolvedBrandName = (ownedBrand.name as string) ?? ''
      } else {
        const { data: member } = await supabase
          .from('brand_members')
          .select('brand_id, brands(id, name)')
          .eq('user_id', user.id)
          .limit(1)
          .single()
        if (member) {
          resolvedBrandId = member.brand_id as string
          const brands = (member.brands as unknown) as { id: string; name: string } | null
          resolvedBrandName = brands?.name ?? ''
        }
      }

      if (!resolvedBrandId) return

      setBrandId(resolvedBrandId)
      setBrandName(resolvedBrandName)

      // Load conversations
      const { data: convs } = await supabase
        .from('conversations')
        .select('id, title, created_at')
        .eq('brand_id', resolvedBrandId)
        .eq('agent', 'mia')
        .order('created_at', { ascending: false })
        .limit(20)

      if (convs) {
        setConversations(convs as Conversation[])
      }
    }

    init()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Load messages for a conversation
  const loadConversation = useCallback(
    async (conversationId: string) => {
      setIsLoadingHistory(true)
      setActiveConversationId(conversationId)
      setMessages([])

      const { data: msgs } = await supabase
        .from('conversation_messages')
        .select('id, role, content, created_at')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
        .limit(100)

      if (msgs) {
        setMessages(
          (msgs as Array<{ id: string; role: string; content: string; created_at: string }>).map(
            (m) => ({
              id: m.id,
              role: m.role === 'assistant' ? 'mia' : 'user',
              content: m.content,
              timestamp: new Date(m.created_at),
            }),
          ),
        )
      }
      setIsLoadingHistory(false)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  // Start a new conversation (clear state)
  const startNewConversation = useCallback(() => {
    setActiveConversationId(null)
    setMessages([])
  }, [])

  // Send a message
  const sendMessage = useCallback(
    async (message: string) => {
      if (!brandId || isStreaming) return

      setIsStreaming(true)

      // Optimistically add user message
      const userMsg: Message = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: message,
        timestamp: new Date(),
      }
      // Placeholder for Mia's streaming response
      const miaPlaceholder: Message = {
        id: `mia-${Date.now()}`,
        role: 'mia',
        content: '',
        timestamp: new Date(),
        streaming: true,
      }

      setMessages((prev) => [...prev, userMsg, miaPlaceholder])

      try {
        const res = await fetch('/api/mia/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            brandId,
            conversationId: activeConversationId ?? undefined,
            message,
          }),
        })

        if (!res.ok || !res.body) {
          throw new Error(`HTTP ${res.status}`)
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          // Keep the last incomplete line in the buffer
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const raw = line.slice(6).trim()
            if (!raw) continue

            let event: Record<string, unknown>
            try {
              event = JSON.parse(raw)
            } catch {
              continue
            }

            if (event.type === 'start' && event.conversationId) {
              const newConvId = event.conversationId as string
              setActiveConversationId(newConvId)
              // Add to sidebar if new
              setConversations((prev) => {
                if (prev.some((c) => c.id === newConvId)) return prev
                return [
                  {
                    id: newConvId,
                    title: message.slice(0, 80),
                    created_at: new Date().toISOString(),
                  },
                  ...prev,
                ]
              })
            }

            if (event.type === 'message') {
              setMessages((prev) => {
                const updated = [...prev]
                const last = updated[updated.length - 1]
                if (last && last.role === 'mia') {
                  updated[updated.length - 1] = {
                    ...last,
                    content: (event.content as string) ?? '',
                    streaming: false,
                    timestamp: new Date(),
                  }
                }
                return updated
              })
            }

            if (event.type === 'error') {
              setMessages((prev) => {
                const updated = [...prev]
                const last = updated[updated.length - 1]
                if (last && last.role === 'mia') {
                  updated[updated.length - 1] = {
                    ...last,
                    content: `Sorry, something went wrong. ${(event.message as string) ?? ''}`,
                    streaming: false,
                  }
                }
                return updated
              })
            }
          }
        }
      } catch (err) {
        console.error('[Chat] Stream error:', err)
        setMessages((prev) => {
          const updated = [...prev]
          const last = updated[updated.length - 1]
          if (last && last.role === 'mia') {
            updated[updated.length - 1] = {
              ...last,
              content: 'Sorry, I encountered an error. Please try again.',
              streaming: false,
            }
          }
          return updated
        })
      } finally {
        setIsStreaming(false)
      }
    },
    [brandId, activeConversationId, isStreaming],
  )

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex h-[calc(100vh-3.5rem-5rem)] md:h-[calc(100vh-3.5rem-1.5rem)] gap-4 -mx-4 md:-mx-8 -my-6 overflow-hidden">
      {/* Conversation sidebar */}
      <aside className="hidden lg:flex w-64 flex-col glass-panel border-r border-white/[0.06] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
          <h2 className="text-sm font-heading font-semibold text-foreground">Conversations</h2>
          <button
            onClick={startNewConversation}
            aria-label="New conversation"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground
              hover:bg-white/[0.06] hover:text-foreground transition-colors duration-150"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-2 px-2">
          {conversations.length === 0 ? (
            <p className="px-2 py-3 text-xs text-muted-foreground/60 text-center">
              No conversations yet
            </p>
          ) : (
            conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => loadConversation(conv.id)}
                className={cn(
                  'w-full text-left px-3 py-2 rounded-lg text-xs transition-colors duration-150 truncate',
                  activeConversationId === conv.id
                    ? 'bg-[#6366f1]/15 text-[#6366f1]'
                    : 'text-muted-foreground hover:bg-white/[0.06] hover:text-foreground',
                )}
              >
                {conv.title || 'Untitled conversation'}
              </button>
            ))
          )}
        </div>
      </aside>

      {/* Main chat area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 md:px-6 py-3 border-b border-white/[0.06] glass-panel shrink-0">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#6366f1]/20 border border-[#6366f1]/20">
            <Sparkles className="h-4 w-4 text-[#6366f1]" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-sm font-heading font-semibold text-foreground leading-tight">
              Mia
            </h1>
            {brandName && (
              <p className="text-[11px] text-muted-foreground leading-tight">
                Marketing manager for {brandName}
              </p>
            )}
          </div>

          {/* Mobile new chat button */}
          <button
            onClick={startNewConversation}
            aria-label="New conversation"
            className="ml-auto lg:hidden flex h-8 w-8 items-center justify-center rounded-lg
              text-muted-foreground hover:bg-white/[0.06] hover:text-foreground transition-colors"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 md:px-6 py-6 space-y-4">
          {isLoadingHistory ? (
            <div className="flex justify-center py-12">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-[#6366f1] animate-bounce [animation-delay:0ms]" />
                <span className="h-1.5 w-1.5 rounded-full bg-[#6366f1] animate-bounce [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 rounded-full bg-[#6366f1] animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          ) : messages.length === 0 ? (
            /* Empty state */
            <div className="flex flex-col items-center justify-center h-full text-center py-16 animate-fade-in">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#6366f1]/10 border border-[#6366f1]/20 mb-4">
                <MessageSquare className="h-8 w-8 text-[#6366f1]" aria-hidden="true" />
              </div>
              <h2 className="text-base font-heading font-semibold text-foreground mb-2">
                Start a conversation with Mia
              </h2>
              <p className="text-sm text-muted-foreground max-w-sm">
                Ask Mia anything about your brand — strategy, insights, campaigns, or what to do next.
              </p>
              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-md">
                {STARTER_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => sendMessage(prompt)}
                    disabled={isStreaming || !brandId}
                    className="text-left px-3 py-2.5 rounded-xl text-xs text-muted-foreground
                      bg-white/[0.03] border border-white/[0.06]
                      hover:bg-white/[0.06] hover:text-foreground hover:border-[#6366f1]/20
                      transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <ChatMessage
                key={msg.id}
                role={msg.role}
                content={msg.content}
                timestamp={msg.timestamp}
                streaming={msg.streaming}
              />
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <ChatInput
          value={inputValue}
          onChange={setInputValue}
          onSend={sendMessage}
          disabled={isStreaming || !brandId}
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Starter prompts
// ---------------------------------------------------------------------------

const STARTER_PROMPTS = [
  "What should I focus on today?",
  "How is my brand performing?",
  "What campaigns should I run next?",
  "Any insights from recent data?",
]
