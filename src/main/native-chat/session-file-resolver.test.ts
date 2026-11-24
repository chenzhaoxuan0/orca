import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveSessionFilePath } from './session-file-resolver'

describe('mcode session lookup', () => {
  it('finds the display log of a session that kept no messages log, and the messages log once it has one', async () => {
    const root = mkdtempSync(join(tmpdir(), 'orca-mcode-lookup-'))
    try {
      const sessionId = 'mvs_lookup'
      const folder = join(
        root,
        '2026',
        '08',
        '10',
        `10-46-45-017-session_${Buffer.from(sessionId, 'utf8').toString('base64')}`
      )
      mkdirSync(folder, { recursive: true })
      const display = join(folder, 'display.jsonl')
      const messages = join(folder, 'messages.jsonl')
      writeFileSync(display, '')
      const options = { mcodeSessionsDir: root }

      expect(await resolveSessionFilePath('mcode', sessionId, options)).toBe(display)
      expect(await resolveSessionFilePath('mcode', 'mvs_other', options)).toBeNull()

      writeFileSync(messages, '')
      expect(await resolveSessionFilePath('mcode', sessionId, options)).toBe(messages)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
