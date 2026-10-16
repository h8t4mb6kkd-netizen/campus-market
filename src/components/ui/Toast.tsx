'use client'

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { Icon } from '@/components/ui/Icon'

interface ToastItem { id: number; type: 'success' | 'error'; message: string }
interface ToastContextValue { success: (message: string) => void; error: (message: string) => void }

const ToastContext = createContext<ToastContextValue | null>(null)
let nextId = 1

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const push = useCallback((type: ToastItem['type'], message: string) => {
    const id = nextId++
    setToasts((prev) => [...prev, { id, type, message }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000)
  }, [])
  return (
    <ToastContext.Provider value={{ success: (m) => push('success', m), error: (m) => push('error', m) }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex flex-col items-center gap-2">
        {toasts.map((t) => (
          <div key={t.id} role="status"
            className={t.type === 'success'
              ? 'flex items-center gap-1.5 rounded-btn bg-ink px-4 py-2 text-sm text-white shadow-card'
              : 'flex items-center gap-1.5 rounded-btn bg-[#d94f3d] px-4 py-2 text-sm text-white shadow-card'}>
            <Icon name={t.type === 'success' ? 'check' : 'flag'} size={15} />
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast 必须在 ToastProvider 内使用')
  return ctx
}
