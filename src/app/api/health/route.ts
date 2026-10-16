import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(): Promise<NextResponse> {
  try {
    await prisma.$queryRaw`SELECT 1`
    return NextResponse.json({ ok: true, db: 'up' })
  } catch {
    return NextResponse.json({ ok: false, db: 'down' }, { status: 500 })
  }
}
