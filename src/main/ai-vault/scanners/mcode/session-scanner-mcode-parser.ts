import { basename } from 'node:path'
import { waitForAiVaultScan } from '../../scan-lifecycle/ai-vault-scan-cancellation'
import { wslGatedReadFile } from '../../../native-chat/transcript-filesystem/wsl-transcript-fs-access'
import { WslTranscriptFsError } from '../../../native-chat/transcript-filesystem/wsl-transcript-fs-error'
import type { AiVaultSession } from '../../../../shared/ai-vault/contracts/ai-vault-types'
import {
  mcodeDisplayLogPathForManifest,
  mcodeMessagesPathForManifest
} from '../../../../shared/ai-vault/session-display/ai-vault-session-log-resource'
import {
  createAccumulator,
  finalizeSession,
  updateTimeline
} from '../../parsing/session-scanner-accumulator'
import { addSessionContent } from '../../parsing/session-scanner-messages'
import { consumeCompleteJsonlLines } from '../../parsing/session-scanner-jsonl-reader'
import { isMissingTranscriptPathError } from '../../discovery/session-path-absence'
import type { FileWithMtime, SessionAccumulator } from '../../session-scanner-types'
import type { TranscriptMessageSink } from '../../transcripts/session-transcript-consumers'
import type { SkippedTranscriptRecord } from '../../transcripts/session-transcript-record-budget'
import { arrayValue, asRecord } from '../../parsing/session-record-fields'
import { extractString } from '../../../../shared/text/trimmed-string'
import { parseJsonObject } from '../../parsing/session-json-object'
import {
  extractContentText,
  normalizeTitleText
} from '../../parsing/session-scanner-text-normalization'

// mcode stores each session as a dated folder: manifest.json beside the log holding its turns.
export function isMcodeSessionManifestPath(filePath: string): boolean {
  return basename(filePath) === 'manifest.json'
}

/** Translate mcode's Anthropic-style blocks into preview content blocks; thinking stays internal. */
function toPreviewBlocks(content: unknown): Record<string, unknown>[] {
  const blocks: Record<string, unknown>[] = []
  for (const value of arrayValue(content)) {
    const block = asRecord(value)
    switch (block?.type) {
      case 'text':
        if (typeof block.text === 'string' && block.text) {
          blocks.push({ type: 'text', text: block.text })
        }
        break
      case 'tool_use':
        blocks.push({ type: 'tool_use', name: extractString(block.name), input: block.input })
        break
      // mcode spells its calls `toolCall` with `arguments`.
      case 'toolCall':
        blocks.push({ type: 'tool_use', name: extractString(block.name), input: block.arguments })
        break
      default:
        break
    }
  }
  return blocks
}

function noteMcodeUserTurn(accumulator: SessionAccumulator, content: unknown) {
  if (!accumulator.fallbackTitle) {
    accumulator.fallbackTitle = normalizeTitleText(extractContentText(content) ?? '')
  }
  accumulator.messageCount++
}

function consumeMcodeMessageLine(accumulator: SessionAccumulator, line: string): void {
  const record = parseJsonObject(line)
  const message = asRecord(record?.message)
  if (!record || !message) {
    return
  }
  const content = toPreviewBlocks(message.content)
  const timestamp = message.timestamp
  updateTimeline(accumulator, timestamp)
  const model = extractString(message.model)
  if (model && !accumulator.model) {
    accumulator.model = model
  }
  if (extractString(message.toolCallId)) {
    addSessionContent(accumulator, 'tool', content, timestamp)
    return
  }
  if (message.role === 'user') {
    noteMcodeUserTurn(accumulator, message.content)
    addSessionContent(accumulator, 'user', content, timestamp)
    return
  }
  if (message.role === 'assistant') {
    accumulator.messageCount++
    addSessionContent(accumulator, 'assistant', content, timestamp)
  }
}

/** Runtimes before the messages log kept a display log: text rows, and calls that hold their own results. */
function consumeMcodeDisplayLine(
  accumulator: SessionAccumulator,
  line: string,
  displayed: Set<string>
): void {
  const record = parseJsonObject(line)
  const message = asRecord(record?.message)
  if (!record || (record.role !== 'user' && record.role !== 'assistant') || !message) {
    return
  }
  // A reopened session writes its recent rows again; each message counts once.
  const id = extractString(record.msgId)
  if (id) {
    if (displayed.has(id)) {
      return
    }
    displayed.add(id)
  }
  const timestamp = message.timestamp
  updateTimeline(accumulator, timestamp)
  const blocks: Record<string, unknown>[] = []
  if (message.msg_type === 1 && typeof message.msg_content === 'string' && message.msg_content) {
    blocks.push({ type: 'text', text: message.msg_content })
  }
  for (const call of arrayValue(message.tool_calls)) {
    const toolCall = asRecord(call)
    if (toolCall) {
      blocks.push({
        type: 'tool_use',
        name: extractString(toolCall.tool_name),
        input: toolCall.tool_call_args
      })
    }
  }
  if (blocks.length === 0) {
    return
  }
  if (record.role === 'user') {
    noteMcodeUserTurn(accumulator, blocks)
    addSessionContent(accumulator, 'user', blocks, timestamp)
    return
  }
  accumulator.messageCount++
  addSessionContent(accumulator, 'assistant', blocks, timestamp)
}

function createMcodeAccumulator(
  file: FileWithMtime,
  manifestContent: string,
  messages?: TranscriptMessageSink
): SessionAccumulator | null {
  const manifest = parseJsonObject(manifestContent)
  const sessionId = extractString(manifest?.sessionId)
  if (!manifest || !sessionId) {
    return null
  }
  const accumulator = createAccumulator({ agent: 'mcode', file, sessionId, messages })
  updateTimeline(accumulator, manifest.createdAtMs)
  updateTimeline(accumulator, manifest.updatedAtMs)
  return accumulator
}

/** Streams one session log; false when it is absent, while other read failures propagate. */
async function consumeMcodeSessionLog(
  path: string,
  consume: (line: string) => void,
  messages: TranscriptMessageSink | undefined,
  onSkippedRecords: ((records: SkippedTranscriptRecord[]) => void) | undefined,
  signal: AbortSignal | undefined
): Promise<boolean> {
  try {
    // Embedded tool output can be megabytes.
    const { trailingPartialLine, skippedRecords } = await consumeCompleteJsonlLines({
      path,
      start: 0,
      signal,
      drain: () => messages?.drain?.() ?? Promise.resolve(),
      onLine: consume
    })
    onSkippedRecords?.(skippedRecords)
    // Accept a complete final record without a newline; malformed partial writes are ignored by the parser.
    if (trailingPartialLine) {
      consume(trailingPartialLine)
    }
    return true
  } catch (error) {
    if (error instanceof WslTranscriptFsError || !isMissingTranscriptPathError(error)) {
      throw error
    }
    return false
  }
}

export async function parseMcodeSessionFile(
  file: FileWithMtime,
  platform: NodeJS.Platform = process.platform,
  messages?: TranscriptMessageSink,
  onSkippedRecords?: (records: SkippedTranscriptRecord[]) => void,
  signal?: AbortSignal
): Promise<AiVaultSession | null> {
  const accumulator = createMcodeAccumulator(
    file,
    await waitForAiVaultScan(wslGatedReadFile(file.path, 'utf-8', 'scan', signal), signal),
    messages
  )
  if (!accumulator) {
    return null
  }
  // A manifest precedes the first turn, so a missing log leaves a valid empty session.
  const read = (path: string, consume: (line: string) => void) =>
    consumeMcodeSessionLog(path, consume, messages, onSkippedRecords, signal)
  const readMessages = await read(mcodeMessagesPathForManifest(file.path), (line) =>
    consumeMcodeMessageLine(accumulator, line)
  )
  if (!readMessages) {
    const displayed = new Set<string>()
    await read(mcodeDisplayLogPathForManifest(file.path), (line) =>
      consumeMcodeDisplayLine(accumulator, line, displayed)
    )
  }
  return finalizeSession(accumulator, platform)
}
