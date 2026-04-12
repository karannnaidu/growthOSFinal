'use client'

import { useState, useEffect } from 'react'
import { Send, CheckCircle2 } from 'lucide-react'
import { AgentAvatar } from '@/components/agents/agent-avatar'

interface MiaControlProps {
  agentId: string
  agentName: string
  brandId: string
}

export function MiaControl({ agentId, agentName, brandId }: MiaControlProps) {
  const [instruction, setInstruction] = useState('')
  const [currentInstruction, setCurrentInstruction] = useState<string | null>(null)
  const [isSending, setIsSending] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!brandId) return
    fetch(`/api/agents/${agentId}/instruct?brandId=${brandId}`)
      .then(r => r.json())
      .then(data => {
        if (data.instruction?.text) {
          setCurrentInstruction(data.instruction.text)
        }
      })
      .catch(() => {})
  }, [agentId, brandId])

  async function handleSend() {
    if (!instruction.trim() || isSending || !brandId) return
    setIsSending(true)
    try {
      const res = await fetch(`/api/agents/${agentId}/instruct`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId, instruction: instruction.trim() }),
      })
      if (res.ok) {
        setCurrentInstruction(instruction.trim())
        setInstruction('')
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      }
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className="glass-panel rounded-2xl p-5">
      <div className="flex items-center gap-2.5 mb-4">
        <AgentAvatar agentId="mia" size="sm" />
        <div>
          <p className="font-heading font-semibold text-sm text-foreground">Mia&apos;s Instructions</p>
          <p className="text-[10px] text-muted-foreground">Tell Mia how to manage {agentName}</p>
        </div>
      </div>

      {currentInstruction && (
        <div className="rounded-xl bg-[#6366f1]/10 border border-[#6366f1]/20 px-3 py-2.5 mb-3">
          <p className="text-[10px] text-[#6366f1] uppercase tracking-wider mb-1">Active Instruction</p>
          <p className="text-xs text-foreground/80">{currentInstruction}</p>
        </div>
      )}

      <div className="flex gap-2">
        <input
          type="text"
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSend() }}
          placeholder={`e.g. "Focus on product pages first"`}
          className="flex-1 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-[#6366f1]/40 focus:outline-none"
        />
        <button
          onClick={handleSend}
          disabled={!instruction.trim() || isSending}
          className="rounded-lg bg-[#6366f1] px-3 py-2 text-white disabled:opacity-40 hover:bg-[#6366f1]/80 transition-colors"
        >
          {saved ? <CheckCircle2 className="h-4 w-4" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
    </div>
  )
}
