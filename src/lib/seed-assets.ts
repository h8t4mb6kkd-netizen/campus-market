import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import type { Category } from '@/lib/constants'

const PALETTES: Record<Category, [string, string]> = {
  BOOKS: ['#dcefe7', '#9fd8c4'],
  DIGITAL: ['#dbe7f7', '#8fb4e8'],
  TRANSPORT: ['#fdeedd', '#f6c48b'],
  DORM: ['#e7e2f7', '#b3a3e8'],
  SPORTS: ['#dff2e2', '#94d3a4'],
  INSTRUMENTS: ['#f7e3ea', '#e3a0b8'],
  CLOTHING: ['#fde5e0', '#f2a898'],
  OTHER: ['#e8edf3', '#b8c2ce'],
}

/** 确定性伪随机（mulberry32）：同 seed 同图，seed 可复现 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export async function generateItemImage(
  category: Category,
  seed: number,
  outDir: string,
): Promise<{ url: string; width: number; height: number }> {
  await mkdir(outDir, { recursive: true })
  const random = mulberry32(seed * 7919)
  const [light, dark] = PALETTES[category]
  const width = 800
  const height = [600, 800, 1000][seed % 3]
  const shapes: string[] = []
  for (let i = 0; i < 5; i += 1) {
    const cx = Math.round(random() * width)
    const cy = Math.round(random() * height)
    const r = Math.round(60 + random() * 160)
    const opacity = (0.12 + random() * 0.18).toFixed(2)
    shapes.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${dark}" opacity="${opacity}" />`)
  }
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${width}" height="${height}" fill="${light}" />
    ${shapes.join('')}
    <rect x="0" y="${height - 18}" width="${width}" height="18" fill="${dark}" opacity="0.35" />
  </svg>`
  const fileName = `${category.toLowerCase()}-${seed}.webp`
  await sharp(Buffer.from(svg)).webp({ quality: 82 }).toFile(path.join(outDir, fileName))
  return { url: `/uploads/seed/${fileName}`, width, height }
}

export async function generateAvatar(name: string, outDir: string): Promise<string> {
  await mkdir(outDir, { recursive: true })
  let hash = 0
  for (const ch of name) hash = (hash * 31 + (ch.codePointAt(0) ?? 0)) >>> 0
  const random = mulberry32(hash)
  const palette = Object.values(PALETTES)[hash % 8]
  const [light, dark] = palette
  const cells: string[] = []
  for (let y = 0; y < 5; y += 1) {
    for (let x = 0; x < 3; x += 1) {
      if (random() > 0.5) {
        cells.push(`<rect x="${x * 16}" y="${y * 16}" width="16" height="16" fill="${dark}" />`)
        cells.push(`<rect x="${(4 - x) * 16}" y="${y * 16}" width="16" height="16" fill="${dark}" />`)
      }
    }
  }
  const svg = `<svg width="80" height="80" xmlns="http://www.w3.org/2000/svg"><rect width="80" height="80" fill="${light}" />${cells.join('')}</svg>`
  const fileName = `avatar-${hash.toString(36)}.webp`
  await sharp(Buffer.from(svg)).webp().toFile(path.join(outDir, fileName))
  return `/uploads/seed/${fileName}`
}
