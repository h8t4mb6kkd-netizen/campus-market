import { copyFileSync, existsSync } from 'node:fs'

if (!existsSync('.env')) {
  copyFileSync('.env.example', '.env')
  console.log('[setup] 未发现 .env，已从 .env.example 生成')
}
