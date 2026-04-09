'use client'

import Image from 'next/image'
import { cn } from '@/lib/utils'
import { AGENT_COLORS } from '@/lib/agents-data'

const SIZES = { sm: 32, md: 48, lg: 64, xl: 120 }

const TEXT_CLASS: Record<string, string> = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base',
  xl: 'text-2xl',
}

export interface AgentAvatarProps {
  agentId: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  state?: 'default' | 'working' | 'thinking' | 'celebrating' | 'concerned'
  className?: string
}

export function AgentAvatar({ agentId, size = 'md', state = 'default', className }: AgentAvatarProps) {
  const px = SIZES[size]
  const color = AGENT_COLORS[agentId.toLowerCase()] || '#6366F1'
  const imagePath = `/agents/${agentId.toLowerCase()}.png`
  const initial = agentId[0]?.toUpperCase() ?? '?'

  const stateClass = {
    default: '',
    working: 'animate-pulse-glow',
    thinking: 'animate-pulse-slow',
    celebrating: 'animate-bounce-once',
    concerned: '',
  }[state]

  return (
    <div
      role="img"
      aria-label={`${agentId} avatar`}
      className={cn('relative inline-flex shrink-0 rounded-full overflow-hidden items-center justify-center', stateClass, className)}
      style={{
        width: px,
        height: px,
        background: `radial-gradient(circle at 35% 35%, ${color}cc, ${color}55)`,
        boxShadow: `0 0 0 2px ${color}33`,
        opacity: state === 'concerned' ? 0.85 : 1,
      }}
    >
      {/* Fallback initial — always rendered beneath the image */}
      <span
        className={cn('absolute inset-0 flex items-center justify-center font-bold leading-none text-white select-none pointer-events-none', TEXT_CLASS[size])}
        aria-hidden="true"
      >
        {initial}
      </span>

      {/* Real portrait — hides itself on error so gradient + initial show through */}
      <Image
        src={imagePath}
        alt=""
        width={px}
        height={px}
        className="absolute inset-0 object-cover w-full h-full"
        onError={(e) => {
          e.currentTarget.style.display = 'none'
        }}
        unoptimized
      />

      {/* Concerned state red tint overlay */}
      {state === 'concerned' && (
        <span
          className="absolute inset-0 rounded-full"
          style={{ background: 'rgba(239,68,68,0.18)' }}
          aria-hidden="true"
        />
      )}
    </div>
  )
}
