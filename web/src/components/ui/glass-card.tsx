import { cn } from '@/lib/utils'

type AccentColor = 'violet' | 'emerald' | 'amber' | 'sky' | 'slate' | 'rose'
type GlassVariant = 'default' | 'gradient' | 'glow'

const accentRing: Record<AccentColor, string> = {
  violet:  'ring-1 ring-violet-500/25',
  emerald: 'ring-1 ring-emerald-500/25',
  amber:   'ring-1 ring-amber-500/25',
  sky:     'ring-1 ring-sky-500/25',
  slate:   'ring-1 ring-slate-500/20',
  rose:    'ring-1 ring-rose-500/25',
}

const accentGlow: Record<AccentColor, string> = {
  violet:  'shadow-violet-500/20',
  emerald: 'shadow-emerald-500/20',
  amber:   'shadow-amber-500/20',
  sky:     'shadow-sky-500/20',
  slate:   'shadow-slate-500/15',
  rose:    'shadow-rose-500/20',
}

const accentLine: Record<AccentColor, string> = {
  violet:  'bg-violet-500/70',
  emerald: 'bg-emerald-500/70',
  amber:   'bg-amber-400/70',
  sky:     'bg-sky-500/70',
  slate:   'bg-slate-400/60',
  rose:    'bg-rose-500/70',
}

const cornerGlowColor: Record<AccentColor, string> = {
  violet:  'bg-violet-500',
  emerald: 'bg-emerald-500',
  amber:   'bg-amber-400',
  sky:     'bg-sky-500',
  slate:   'bg-slate-400',
  rose:    'bg-rose-500',
}

interface GlassCardProps {
  variant?: GlassVariant
  accentColor?: AccentColor
  showAccentLine?: boolean
  showCornerGlow?: boolean
  className?: string
  children: React.ReactNode
}

export function GlassCard({
  variant = 'default',
  accentColor = 'violet',
  showAccentLine = false,
  showCornerGlow = false,
  className,
  children,
}: GlassCardProps) {
  const needsRelative = showAccentLine || showCornerGlow
  const isGradient = variant === 'gradient'
  const isGlow = variant === 'glow'

  return (
    <div
      className={cn(
        'glass-card p-6',
        needsRelative && 'relative group',
        isGradient && accentRing[accentColor],
        isGlow && ['glass-card--glow cursor-pointer shadow-lg', accentGlow[accentColor]],
        className
      )}
    >
      {(showAccentLine || isGradient) && (
        <div className={cn('absolute top-0 left-0 w-full h-0.5', accentLine[accentColor])} />
      )}
      {(showCornerGlow || isGradient) && (
        <div
          className={cn(
            'absolute top-[-30%] right-[-5%] w-32 h-32 rounded-full blur-[50px] opacity-10 group-hover:opacity-18 transition-opacity pointer-events-none',
            cornerGlowColor[accentColor]
          )}
        />
      )}
      <div className="relative">{children}</div>
    </div>
  )
}
