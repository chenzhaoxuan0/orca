import { decodeClaudeTranscriptLine } from '../../transcript-decoding/transcript-line-decoders-claude'
import { decodeCodexTranscriptLine } from '../../transcript-decoding/transcript-line-decoders-codex'
import { decodeGrokTranscriptLine } from '../../transcript-decoding/transcript-line-decoders-grok'
import { decodeOmpTranscriptLine } from '../../transcript-decoding/transcript-line-decoders-omp'
import { createMcodeTranscriptDecoder } from '../../transcript-decoding/transcript-line-decoders-mcode'
import { createReadStream } from 'node:fs'
import { decodeTranscriptStream } from '../../transcript-streaming/transcript-stream-lines'
import {
  readCodexLocalHistory,
  type CodexHistoryRecord
} from '../../transcript-history/codex/codex-local-history'

export async function readLegacyImportTranscript(
  input: { filePath: string; codex: boolean; roots?: readonly string[] },
  visit: (line: string, fallbackId: string, recordId?: string, selected?: boolean) => null,
  visitRecord?: (record: CodexHistoryRecord) => void
): Promise<{ consumedBytes: number }> {
  return input.codex
    ? {
        consumedBytes: await readCodexLocalHistory({
          ...input,
          visitRecord,
          visit: (line, fallbackId, selected, recordId) =>
            visit(line, fallbackId, recordId, selected)
        })
      }
    : decodeTranscriptStream(
        createReadStream(input.filePath),
        input.filePath,
        0,
        visit,
        true,
        16 * 1024 * 1024
      )
}

export const TRANSCRIPT_DECODERS = {
  claude: decodeClaudeTranscriptLine,
  codex: (line: string, fallbackId: string) =>
    decodeCodexTranscriptLine(line, fallbackId, { historyImport: true }),
  grok: decodeGrokTranscriptLine,
  omp: decodeOmpTranscriptLine
} as const

export type LegacyTranscriptAgent = keyof typeof TRANSCRIPT_DECODERS | 'mcode'

/** One decoder per read: mcode's display log writes a session's recent rows again when it reopens. */
export function createLegacyTranscriptDecoder(agent: LegacyTranscriptAgent) {
  return agent === 'mcode' ? createMcodeTranscriptDecoder() : TRANSCRIPT_DECODERS[agent]
}
