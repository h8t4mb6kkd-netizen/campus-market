'use client'

import { useState } from 'react'
import { Icon } from '@/components/ui/Icon'

interface CarouselImage { url: string; width: number; height: number }

export function ImageCarousel({ images }: { images: CarouselImage[] }) {
  const [index, setIndex] = useState(0)
  const current = images[index]
  if (!current) return <div className="aspect-square rounded-card bg-[#e8edf3]" />
  return (
    <div>
      <div className="relative overflow-hidden rounded-card bg-[#e8edf3]" style={{ aspectRatio: `${current.width} / ${current.height}` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={current.url} alt="" className="absolute inset-0 h-full w-full object-cover" />
        {images.length > 1 && (
          <>
            <button type="button" aria-label="上一张"
              onClick={() => setIndex((i) => (i - 1 + images.length) % images.length)}
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/35 p-1.5 text-white hover:bg-black/55">
              <Icon name="close" size={14} className="rotate-45" />
            </button>
            <button type="button" aria-label="下一张"
              onClick={() => setIndex((i) => (i + 1) % images.length)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/35 p-1.5 text-white hover:bg-black/55">
              <Icon name="close" size={14} className="-rotate-45" />
            </button>
            <span className="absolute bottom-2 right-2 rounded-full bg-black/40 px-2 py-0.5 text-xs text-white">
              {index + 1} / {images.length}
            </span>
          </>
        )}
      </div>
      {images.length > 1 && (
        <div className="mt-2 flex gap-2 overflow-x-auto">
          {images.map((image, i) => (
            <button key={image.url} type="button" onClick={() => setIndex(i)}
              className={`size-14 shrink-0 overflow-hidden rounded-btn border-2 ${i === index ? 'border-brand' : 'border-transparent'}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image.url} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
