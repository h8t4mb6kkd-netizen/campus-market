import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

export interface StoredImage {
  url: string
  width: number
  height: number
}

export interface Storage {
  /** 保存一张已通过初筛的图片：转 WebP、修正 EXIF 方向，返回 URL 与输出像素尺寸 */
  putImage(buffer: Buffer): Promise<StoredImage>
}

const UPLOAD_ROOT = path.join(process.cwd(), 'public', 'uploads')

/** 本地磁盘实现（无 VPN 硬约束下的默认）；未来切 OSS/CDN 只替换这个对象 */
const localStorageImpl: Storage = {
  async putImage(buffer: Buffer): Promise<StoredImage> {
    const year = String(new Date().getFullYear())
    const dir = path.join(UPLOAD_ROOT, year)
    await mkdir(dir, { recursive: true })
    const fileName = `${randomUUID()}.webp`
    const info = await sharp(buffer).rotate().webp({ quality: 82 }).toFile(path.join(dir, fileName))
    return { url: `/uploads/${year}/${fileName}`, width: info.width, height: info.height }
  },
}

export const storage: Storage = localStorageImpl
