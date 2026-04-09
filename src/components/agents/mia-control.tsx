'use client'

import { useState } from 'react'
import { Send, Bot } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AgentAvatar } from '@/components/agents/agent-avatar'
import { AGENTS } from '@/lib/agents-data'

interface MiaControlProps {
  agentId: string
  agentName: string
  brandId: string
}

export function MiaControl({ agentId, agentName }: MiaControlProps) {
  const [instruction, setInstruction] = useState('')
  const [isSending, setIsSending] = useState(false)

  // Find connected agents from the agents chain data
  const agent = AGENTS.find((a) => a.id === agentId)
  const connectedIds = agent?.skills?.length
    ? AGENTS.filter((a) => a.id !== agentId && a.id !== 'mia').slice(0, 4)
    : []

  async function handleSend() {
    if (!instruction.trim() || isSending) return
    setIsSending(true)
    // Placeholder - in production this would call the Mia instruction API
    await new Promise((r) => setTimeout(r, 800))
    setInstruction('')
    setIsSending(false)
  }

  return (
    <div className="glass-panel rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-2">
        <AgentAvatar agentId="mia" size="sm" />
        <h2 className="text-sm font-heading font-semibold text-foreground">Mia&apos;s Control Panel</h2>
      </div>

      <div className="p-4 space-y-4">
        {/* Latest instruction placeholder */}
        <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">
            Latest Instruction
          </p>
          <p className="text-xs text-muted-foreground italic">
            No recent instructions for {agentName}.
          </p>
        </div>

        {/* Instruct Mia input */}
        <div className="flex items-center gap-2">
          <Input
            type="text"
            placeholder={`Instruct Mia about ${agentName}...`}
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            className="flex-1 text-xs"
            disabled={isSending}
          />
          <Button
            size="icon-xs"
            variant="outline"
            onClick={handleSend}
            disabled={!instruction.trim() || isSending}
            aria-label="Send instruction to Mia"
          >
            <Send className="h-3 w-3" />
          </Button>
        </div>

        {/* Connected agents */}
        {connectedIds.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <Bot className="h-3 w-3" />
              Connected Agents
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              {connectedIds.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center gap-1.5 rounded-full px-2 py-1 bg-white/[0.04] border border-white/[0.06]"
                >
                  <AgentAvatar agentId={a.id} size="sm" className="!w-4 !h-4" />
                  <span className="text-[10px] text-foreground font-medium">{a.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
