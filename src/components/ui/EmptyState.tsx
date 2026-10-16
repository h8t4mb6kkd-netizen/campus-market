import type { ReactNode } from 'react'
import { Icon, type IconName } from '@/components/ui/Icon'

export function EmptyState({ title, description, action, iconName = 'inbox' }: {
  title: string; description?: string; action?: ReactNode; iconName?: IconName
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-[#e6f6f1] text-brand"><Icon name={iconName} size={26} /></span>
      <p className="text-base font-semibold">{title}</p>
      {description && <p className="text-sm text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
