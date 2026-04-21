'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Sparkles, MessageSquare, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { ChatMessage } from '@/components/chat/chat-message'
import { ChatInput } from '@/components/chat/chat-input'
import { ChatSidebar } from '@/components/chat/chat-sidebar'
import { ActiveContext } from '@/components/chat/active-context'
import { cn } from '@/lib/utils'
import { ActionCard, type ActionState } from '@/components/chat/action-card'
import { CollectCard } from '@/components/chat/collect-card'
import { type MiaAction, type SkillAction, type CollectAction } from '@/lib/mia-actions'
import { MaxHandoffCard } from '@/components/chat/max-handoff-card'
import { MaxOpeningCard, type MaxOpeningPayload } from '@/components/chat/max-opening-card'
import { MaxBundleCard, type MaxBundlePayload } from '@/components/chat/max-bundle-card'
import type { AudienceTier } from '@/components/campaigns/AudienceTierCard'
import type { PreflightResult } from '@/lib/preflight-types'

// ---------------------------------------------------------------------------
// Launch handoff types
// ---------------------------------------------------------------------------

type LaunchState =
  | 'awaiting_intent'
  | 'awaiting_approval_of_plan'
  | 'awaiting_approval_of_images'
  | 'launching'
  | 'completed'
  | 'cancelled'

type LaunchCardKind = 'max_handoff' | 'max_opening' | 'max_bundle' | 'launch_confirm' | 'launch_result'

interface LaunchHandoff {
  state: LaunchState
  cardKind: LaunchCardKind
  cardPayload: Record<string, unknown>
  preflight?: PreflightResult
  budget?: number
  approvedTiers?: AudienceTier[]
  approvedCopyIdx?: number
  loading?: boolean
  error?: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function storageKeyForActiveConv(brandId: string): string {
  return `mia_active_conversation_${brandId}`
}

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

interface BrandContextData {
  focusAreas: string[]
  aiPreset: string
}

interface ActiveAgentData {
  agentId: string
  status: string
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ChatPage() {
  const [brandId, setBrandId] = useState<string | null>(null)
  const [brandName, setBrandName] = useState<string>('')
  const [brandContext, setBrandContext] = useState<BrandContextData | undefined>(undefined)
  const [activeAgents, setActiveAgents] = useState<ActiveAgentData[]>([])
  const [ingestedSources, setIngestedSources] = useState<string[]>([])
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)

  // Action execution state — keyed by message ID
  const [messageActions, setMessageActions] = useState<Record<string, MiaAction[]>>({})
  const [actionStates, setActionStates] = useState<Record<string, ActionState>>({})
  const [executingMessageId, setExecutingMessageId] = useState<string | null>(null)

  // Launch handoff state — keyed by message ID (the Mia assistant message
  // that triggered the handoff). Tracks the Max state machine locally.
  const [launchHandoffs, setLaunchHandoffs] = useState<Record<string, LaunchHandoff>>({})

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const didRestoreRef = useRef(false)
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
      const stored = sessionStorage.getItem('onboarding_brand_id') || localStorage.getItem('growth_os_brand_id')
      if (stored) { resolvedBrandId = stored } else {
        try {
          const res = await fetch('/api/brands/me')
          if (res.ok) {
            const data = await res.json()
            if (data.brandId) {
              resolvedBrandId = data.brandId
              localStorage.setItem('growth_os_brand_id', data.brandId)
            }
          }
        } catch { /* ignore */ }
      }

      if (!resolvedBrandId) return

      setBrandId(resolvedBrandId)

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

      if (brandId) {
        try { localStorage.setItem(storageKeyForActiveConv(brandId), conversationId) } catch { /* quota or privacy mode */ }
      }

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
    [brandId],
  )

  // Restore last active conversation after brandId resolves
  useEffect(() => {
    if (!brandId || didRestoreRef.current) return
    didRestoreRef.current = true
    let stored: string | null = null
    try { stored = localStorage.getItem(storageKeyForActiveConv(brandId)) } catch { /* noop */ }
    if (stored) {
      loadConversation(stored).catch(() => {
        try { localStorage.removeItem(storageKeyForActiveConv(brandId)) } catch { /* noop */ }
      })
    }
  }, [brandId, loadConversation])

  // Reset restore guard when brandId changes so brand switches trigger a fresh restore
  useEffect(() => { didRestoreRef.current = false }, [brandId])

  // Load chat-context sidebar data (brand focus, active agents, sources).
  // Re-runs every 30s so agent status reflects in-flight skill runs.
  useEffect(() => {
    if (!brandId) return
    let cancelled = false

    async function fetchContext() {
      try {
        const res = await fetch(`/api/mia/chat-context?brandId=${brandId}`)
        if (!res.ok || cancelled) return
        const data = await res.json() as {
          brandContext?: BrandContextData
          activeAgents?: ActiveAgentData[]
          sources?: string[]
        }
        if (cancelled) return
        if (data.brandContext) setBrandContext(data.brandContext)
        if (data.activeAgents) setActiveAgents(data.activeAgents)
        if (data.sources) setIngestedSources(data.sources)
      } catch {
        // Non-fatal — sidebar shows empty state
      }
    }

    fetchContext()
    const interval = setInterval(fetchContext, 30_000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [brandId])

  // Start a new conversation (clear state)
  const startNewConversation = useCallback(() => {
    setActiveConversationId(null)
    setMessages([])
    if (brandId) {
      try { localStorage.removeItem(storageKeyForActiveConv(brandId)) } catch { /* noop */ }
    }
  }, [brandId])

  const handleActionsFound = useCallback((messageId: string, actions: MiaAction[]) => {
    setMessageActions((prev) => {
      if (prev[messageId]) return prev
      return { ...prev, [messageId]: actions }
    })
    const initialStates: Record<string, ActionState> = {}
    for (const a of actions) {
      initialStates[a.id] = { status: 'pending' }
    }
    setActionStates((prev) => ({ ...prev, ...initialStates }))
  }, [])

  // Drive the Max launch-intent state machine one turn at a time.
  // Called from the `handoff` SSE event and from Max card approvals.
  const advanceLaunchIntent = useCallback(
    async (
      messageId: string,
      currentState: LaunchState,
      userInput?: Record<string, unknown>,
    ) => {
      if (!brandId) return
      setLaunchHandoffs((prev) => {
        const existing = prev[messageId]
        if (!existing) return prev
        return { ...prev, [messageId]: { ...existing, loading: true, error: undefined } }
      })
      try {
        const res = await fetch('/api/mia/launch-intent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            brandId,
            conversationId: activeConversationId ?? undefined,
            currentState,
            userInput,
          }),
        })
        const body = (await res.json()) as {
          state?: LaunchState
          card_kind?: LaunchCardKind
          card_payload?: Record<string, unknown>
          preflight?: PreflightResult
          error?: string
        }
        if (!res.ok) {
          setLaunchHandoffs((prev) => {
            const existing = prev[messageId]
            if (!existing) return prev
            return {
              ...prev,
              [messageId]: { ...existing, loading: false, error: body.error ?? `HTTP ${res.status}` },
            }
          })
          return
        }
        setLaunchHandoffs((prev) => {
          const existing = prev[messageId]
          if (!existing) return prev
          return {
            ...prev,
            [messageId]: {
              ...existing,
              state: body.state ?? existing.state,
              cardKind: body.card_kind ?? existing.cardKind,
              cardPayload: body.card_payload ?? {},
              preflight: body.preflight ?? existing.preflight,
              loading: false,
              error: undefined,
            },
          }
        })
      } catch (err) {
        setLaunchHandoffs((prev) => {
          const existing = prev[messageId]
          if (!existing) return prev
          return {
            ...prev,
            [messageId]: {
              ...existing,
              loading: false,
              error: err instanceof Error ? err.message : 'Launch intent failed',
            },
          }
        })
      }
    },
    [brandId, activeConversationId],
  )

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
              if (brandId) {
                try { localStorage.setItem(storageKeyForActiveConv(brandId), newConvId) } catch { /* noop */ }
              }
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

            if (event.type === 'handoff' && event.agent === 'max') {
              // Capture which Mia message owns this handoff. The `{type:'message'}`
              // SSE event that precedes it has already updated the last mia entry,
              // so use that message's id to key the handoff card.
              setMessages((prev) => {
                const last = prev[prev.length - 1]
                if (last && last.role === 'mia') {
                  setLaunchHandoffs((h) => ({
                    ...h,
                    [last.id]: {
                      state: 'awaiting_intent',
                      cardKind: 'max_opening',
                      cardPayload: {},
                      loading: true,
                    },
                  }))
                  // Kick off the first launch-intent turn to fetch preflight + opening card.
                  void advanceLaunchIntent(last.id, 'awaiting_intent')
                }
                return prev
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
    [brandId, activeConversationId, isStreaming, advanceLaunchIntent],
  )

  const handleRunActions = useCallback(
    async (messageId: string) => {
      if (!brandId || !activeConversationId || executingMessageId) return
      const actions = messageActions[messageId]
      if (!actions) return

      const skillActions = actions.filter((a): a is SkillAction => a.type === 'skill')
      if (skillActions.length === 0) return

      setExecutingMessageId(messageId)

      try {
        const res = await fetch('/api/mia/actions/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            brandId,
            conversationId: activeConversationId,
            actions: skillActions,
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

            if (event.type === 'action_start') {
              setActionStates((prev) => ({
                ...prev,
                [event.actionId as string]: { status: 'running' },
              }))
            }

            if (event.type === 'action_complete') {
              setActionStates((prev) => ({
                ...prev,
                [event.actionId as string]: {
                  status: 'complete',
                  output: event.output as Record<string, unknown>,
                  creditsUsed: event.creditsUsed as number,
                },
              }))
            }

            if (event.type === 'action_failed') {
              setActionStates((prev) => ({
                ...prev,
                [event.actionId as string]: {
                  status: 'failed',
                  error: event.error as string,
                },
              }))
            }

            if (event.type === 'summary') {
              const summaryMsg: Message = {
                id: `summary-${Date.now()}`,
                role: 'mia',
                content: event.content as string,
                timestamp: new Date(),
              }
              setMessages((prev) => [...prev, summaryMsg])
            }
          }
        }
      } catch (err) {
        console.error('[Chat] Execute error:', err)
      } finally {
        setExecutingMessageId(null)
      }
    },
    [brandId, activeConversationId, executingMessageId, messageActions],
  )

  const handleSkipActions = useCallback((messageId: string) => {
    const actions = messageActions[messageId]
    if (!actions) return
    const skipped: Record<string, ActionState> = {}
    for (const a of actions) {
      skipped[a.id] = { status: 'failed', error: 'Skipped by user' }
    }
    setActionStates((prev) => ({ ...prev, ...skipped }))
  }, [messageActions])

  const handleCollected = useCallback((_actionId: string, _value: string) => {
    setActionStates((prev) => ({
      ...prev,
      [_actionId]: { status: 'complete' },
    }))
  }, [])

  const handleSkipCollect = useCallback((actionId: string) => {
    setActionStates((prev) => ({
      ...prev,
      [actionId]: { status: 'failed', error: 'Skipped' },
    }))
  }, [])

  // ---------------------------------------------------------------------------
  // Render — 3-panel layout
  // ---------------------------------------------------------------------------

  return (
    <div className="flex h-[calc(100vh-3.5rem-5rem)] md:h-[calc(100vh-3.5rem-1.5rem)] gap-0 -mx-4 md:-mx-8 -my-6 overflow-hidden">
      {/* Left panel: ChatSidebar (hidden < lg) */}
      <div className="hidden lg:flex">
        <ChatSidebar
          conversations={conversations}
          activeId={activeConversationId}
          onSelect={loadConversation}
          onNew={startNewConversation}
          onPrompt={sendMessage}
          shortcutsDisabled={isStreaming || !brandId}
        />
      </div>

      {/* Center: Main chat area */}
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
            messages.map((msg) => {
              const msgActions = messageActions[msg.id]
              const skillActions = msgActions?.filter((a): a is SkillAction => a.type === 'skill') ?? []
              const collectActions = msgActions?.filter((a): a is CollectAction => a.type === 'collect') ?? []
              const totalCredits = skillActions.length // ~1 credit per skill estimate

              return (
                <div key={msg.id}>
                  <ChatMessage
                    role={msg.role}
                    content={msg.content}
                    timestamp={msg.timestamp}
                    streaming={msg.streaming}
                    onActionClick={(skillId) => sendMessage(`Run ${skillId}`)}
                    onActionsFound={(actions) => handleActionsFound(msg.id, actions)}
                  />

                  {/* Collect cards */}
                  {collectActions.map((ca) => (
                    <div key={ca.id} className="ml-11">
                      <CollectCard
                        action={ca}
                        brandId={brandId ?? ''}
                        onCollected={handleCollected}
                        onSkip={handleSkipCollect}
                        disabled={!!executingMessageId}
                      />
                    </div>
                  ))}

                  {/* Action card */}
                  {skillActions.length > 0 && (
                    <div className="ml-11">
                      <ActionCard
                        actions={skillActions}
                        actionStates={actionStates}
                        totalCredits={totalCredits}
                        onRunAll={() => handleRunActions(msg.id)}
                        onSkip={() => handleSkipActions(msg.id)}
                        disabled={!!executingMessageId}
                      />
                    </div>
                  )}

                  {/* Max launch handoff cards */}
                  {launchHandoffs[msg.id] && (
                    <div className="ml-11 mt-2">
                      <LaunchHandoffView
                        handoff={launchHandoffs[msg.id]!}
                        onAdvance={(state, userInput) => advanceLaunchIntent(msg.id, state, userInput)}
                      />
                    </div>
                  )}
                </div>
              )
            })
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

      {/* Right panel: ActiveContext (hidden < xl) */}
      <div className="hidden xl:flex">
        <ActiveContext
          brandContext={brandContext}
          activeAgents={activeAgents}
          sources={ingestedSources}
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// LaunchHandoffView — renders the correct Max card for the current state
// ---------------------------------------------------------------------------

function LaunchHandoffView({
  handoff,
  onAdvance,
}: {
  handoff: LaunchHandoff
  onAdvance: (state: LaunchState, userInput?: Record<string, unknown>) => void
}) {
  if (handoff.loading) {
    return <div className="text-xs text-muted-foreground">Max is working…</div>
  }
  if (handoff.error) {
    return (
      <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
        {handoff.error}
      </div>
    )
  }

  if (handoff.cardKind === 'max_handoff') {
    const preflight = (handoff.cardPayload.preflight as PreflightResult | undefined) ?? handoff.preflight
    if (!preflight) return null
    return <MaxHandoffCard preflight={preflight} />
  }

  if (handoff.cardKind === 'max_opening') {
    const payload = handoff.cardPayload as unknown as MaxOpeningPayload
    return (
      <MaxOpeningCard
        payload={payload}
        onSubmit={({ angle, budget, proposeAll }) => {
          // Cache budget so we can pass it through to `launching` later.
          onAdvance('awaiting_approval_of_plan', { angle, budget, proposeAll })
        }}
      />
    )
  }

  if (handoff.cardKind === 'max_bundle') {
    const payload = handoff.cardPayload as unknown as MaxBundlePayload
    return (
      <MaxBundleCard
        payload={payload}
        onApprove={({ selectedTiers, selectedCopyIdx }) => {
          // For now we skip the image-approval loop and go straight through
          // `awaiting_approval_of_images` → `launching` in the next call.
          onAdvance('awaiting_approval_of_images', {
            approvedTiers: selectedTiers,
            approvedCopyIdx: selectedCopyIdx,
          })
        }}
      />
    )
  }

  if (handoff.cardKind === 'launch_confirm') {
    return (
      <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm space-y-2">
        <div>Images approved. Ready to launch.</div>
        <button
          onClick={() => onAdvance('launching')}
          className="rounded bg-emerald-600 text-white px-3 py-1 text-sm"
        >
          Launch campaign
        </button>
      </div>
    )
  }

  if (handoff.cardKind === 'launch_result') {
    return (
      <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm">
        <div className="font-medium mb-1">Campaign launched</div>
        <pre className="text-xs whitespace-pre-wrap text-zinc-700">
          {JSON.stringify(handoff.cardPayload, null, 2)}
        </pre>
      </div>
    )
  }

  return null
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
