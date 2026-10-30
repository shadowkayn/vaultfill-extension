import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { FISH_IMAGES, isActionFishVariant, type FishVariant } from './fish-assets'

export function FishMascot({
  badge,
  compact = false,
  variant = 'guardian',
}: {
  badge?: string
  compact?: boolean
  variant?: FishVariant
}) {
  const actionClassName = isActionFishVariant(variant) ? ' fish-mascot--action' : ''

  return (
    <div
      className={`fish-mascot fish-mascot--${variant}${actionClassName}${compact ? ' fish-mascot--compact' : ''}`}
      aria-hidden="true"
    >
      <span className="fish-mascot-glow" />
      <img src={FISH_IMAGES[variant]} alt="" />
      {badge && <span className="fish-mascot-badge">{badge}</span>}
    </div>
  )
}

export function FishButton({
  variant = 'guardian',
  tone = 'primary',
  className = '',
  children,
  ...buttonProps
}: {
  variant?: FishVariant
  tone?: 'primary' | 'secondary' | 'danger'
  children: ReactNode
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'>) {
  const actionClassName = isActionFishVariant(variant) ? ' fish-button--action' : ''

  return (
    <button
      {...buttonProps}
      className={`${tone}-button fish-button fish-button--${variant}${actionClassName} ${className}`.trim()}
    >
      <img src={FISH_IMAGES[variant]} alt="" aria-hidden="true" />
      <span>{children}</span>
    </button>
  )
}
