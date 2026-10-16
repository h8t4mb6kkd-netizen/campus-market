import type { TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
}

export function Textarea({ label, error, className, id, name, ...rest }: TextareaProps) {
  const inputId = id ?? name
  return (
    <label className="block text-sm" htmlFor={inputId}>
      {label && <span className="mb-1 block font-medium">{label}</span>}
      <textarea
        id={inputId}
        name={name}
        className={cn(
          'w-full rounded-btn border border-line bg-white px-3 py-2 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20',
          error && 'border-[#d94f3d]',
          className,
        )}
        {...rest}
      />
      {error && <span className="mt-1 block text-xs text-[#d94f3d]">{error}</span>}
    </label>
  )
}
