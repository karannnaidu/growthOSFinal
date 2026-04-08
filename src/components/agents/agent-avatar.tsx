'use client'

import { cn } from '@/lib/utils'

const AGENT_COLORS: Record<string, string> = {
  mia:   '#6366F1',
  scout: '#0D9488',
  aria:  '#F97316',
  luna:  '#10B981',
  hugo:  '#D97706',
  sage:  '#8B5CF6',
  max:   '#3B82F6',
  atlas: '#E11D48',
  echo:  '#64748B',
  nova:  '#7C3AED',
  navi:  '#0EA5E9',
  penny: '#059669',
}

const SIZE_PX: Record<string, number> = {
  sm:  32,
  md:  48,
  lg:  64,
  xl: 120,
}

const TEXT_CLASS: Record<string, string> = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base',
  xl: 'text-2xl',
}

export interface AgentAvatarProps {
  agentId: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  state?: 'default' | 'working' | 'celebrating' | 'concerned' | 'thinking'
  className?: string
}

export function AgentAvatar({
  agentId,
  size = 'md',
  state = 'default',
  className,
}: AgentAvatarProps) {
  const color = AGENT_COLORS[agentId.toLowerCase()] ?? '#6366F1'
  const px = SIZE_PX[size]
  const initial = agentId[0]?.toUpperCase() ?? '?'

  const stateClass = {
    default:     '',
    working:     'animate-pulse-glow',
    thinking:    'animate-pulse-slow',
    celebrating: 'animate-bounce-once',
    concerned:   '',
  }[state]

  return (
    <span
      role="img"
      aria-label={`${agentId} avatar`}
      className={cn('relative inline-flex shrink-0 items-center justify-center rounded-full', stateClass, className)}
      style={{
        width:  px,
        height: px,
        background: `radial-gradient(circle at 35% 35%, ${color}cc, ${color}55)`,
        boxShadow:  `0 0 0 2px ${color}33`,
        opacity: state === 'concerned' ? 0.85 : 1,
      }}
    >
      {/* concerned red tint overlay */}
      {state === 'concerned' && (
        <span
          className="absolute inset-0 rounded-full"
          style={{ background: 'rgba(239,68,68,0.18)' }}
          aria-hidden="true"
        />
      )}

      <span
        className={cn('relative font-bold leading-none text-white select-none', TEXT_CLASS[size])}
      >
        {initial}
      </span>
    </span>
  )
}
