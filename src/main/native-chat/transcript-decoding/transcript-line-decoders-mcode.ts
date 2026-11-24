import type {
  NativeChatBlock,
  NativeChatMessage
} from '../../../shared/native-chat/native-chat-types'
import { arrayValue, asRecord } from '../../ai-vault/parsing/session-record-fields'
import { extractString } from '../../../shared/text/trimmed-string'
import { parseJsonObject } from '../../ai-vault/parsing/session-json-object'
import { timestampMs } from '../../ai-vault/parsing/session-record-time'
import { BoundedMap } from '../../../shared/collections/bounded-map'
import { claudeContentBlocks, toolResultOutput } from './transcript-record-blocks'

type Row = Record<string, unknown>

// mcode numbers its display rows: 1 holds text, 2 holds tool calls, and the rest display state.
const TEXT_ROW = 1
const TOOL_CALL_ROW = 2
/** mcode's `tool_call_status`: started 1, finished 2, failed 3. */
const TOOL_CALL_FAILED = 3
/** A reopened session writes its recent display rows again; this many ids cover one rewrite. */
const REMEMBERED_DISPLAY_ROWS = 256

function parseTimestamp(value: unknown): number | null {
  const parsed = timestampMs(value)
  return Number.isFinite(parsed) ? parsed : null
}

/** One decoder per read: the display log repeats a session's recent rows whenever it reopens. */
export function createMcodeTranscriptDecoder(): (
  line: string,
  fallbackId: string
) => NativeChatMessage | null {
  const displayed = new BoundedMap<string, true>({ maxEntries: REMEMBERED_DISPLAY_ROWS })
  return (line, fallbackId) => {
    const record = parseJsonObject(line)
    const message = asRecord(record?.message)
    if (!record || !message) {
      return null
    }
    // A session keeps one of two logs, each one message per line: the messages log wraps an
    // Anthropic-shaped message, and the display log older runtimes kept carries each call's
    // result beside the call.
    return typeof message.msg_type === 'number'
      ? decodeMcodeDisplayRow(record, message, fallbackId, displayed)
      : decodeMcodeMessageRow(record, message, fallbackId)
  }
}

function decodeMcodeMessageRow(
  record: Row,
  message: Row,
  fallbackId: string
): NativeChatMessage | null {
  const id = extractString(record.message_id) ?? fallbackId
  const timestamp = parseTimestamp(message.timestamp)
  const toolCallId = extractString(message.toolCallId)
  if (toolCallId) {
    // Pair the output with its call so the chat renders one collapsed tool row instead of raw text.
    return {
      id,
      role: 'tool',
      blocks: [
        {
          type: 'tool-result',
          callId: toolCallId,
          output: toolResultOutput(message.content),
          ...(message.isError === true ? { isError: true } : {})
        }
      ],
      timestamp,
      source: 'transcript'
    }
  }
  if (message.role === 'user') {
    const blocks = claudeContentBlocks(normalizeMcodeParts(message.content))
      .map(withoutReminderText)
      .filter((block) => block !== null)
    if (blocks.length === 0) {
      return null
    }
    return {
      id,
      role: blocks.every((block) => block.type === 'tool-result') ? 'tool' : 'user',
      blocks,
      timestamp,
      source: 'transcript'
    }
  }
  if (message.role === 'assistant') {
    // One line can hold thinking beside the answer; a line maps to one message, so mixed turns
    // keep the answer and pure-thought lines stay reasoning rows.
    const parts = normalizeMcodeParts(message.content)
    const answerParts = parts.filter((part) => {
      const type = asRecord(part)?.type
      return type !== 'thinking' && type !== 'redacted_thinking'
    })
    const blocks = claudeContentBlocks(answerParts)
    if (blocks.length > 0) {
      return { id, role: 'assistant', blocks, timestamp, source: 'transcript' }
    }
    const thought = claudeContentBlocks(parts)
    return thought.length > 0
      ? { id, role: 'reasoning', blocks: thought, timestamp, source: 'transcript' }
      : null
  }
  return null
}

function decodeMcodeDisplayRow(
  record: Row,
  message: Row,
  fallbackId: string,
  displayed: BoundedMap<string, true>
): NativeChatMessage | null {
  const id = extractString(record.msgId) ?? fallbackId
  if (displayed.has(id)) {
    return null
  }
  displayed.set(id, true)
  const timestamp = parseTimestamp(message.timestamp)
  const text = extractString(message.msg_content)
  if (message.msg_type === TOOL_CALL_ROW) {
    // A row holds each call with its result, so the pair shares this message and its call id.
    const blocks: NativeChatBlock[] = text ? [{ type: 'text', text }] : []
    for (const value of arrayValue(message.tool_calls)) {
      const call = asRecord(value)
      const callId = call ? extractString(call.tool_call_id) : null
      if (!call || !callId) {
        continue
      }
      blocks.push({
        type: 'tool-call',
        name: extractString(call.tool_name) ?? 'tool',
        input: parseMcodeJson(call.tool_call_args),
        callId
      })
      blocks.push({
        type: 'tool-result',
        callId,
        output: toolResultOutput(mcodeToolResult(call.tool_call_result_data)),
        ...(call.tool_call_status === TOOL_CALL_FAILED ? { isError: true } : {})
      })
    }
    return blocks.length > 0
      ? { id, role: 'assistant', blocks, timestamp, source: 'transcript' }
      : null
  }
  if (message.msg_type !== TEXT_ROW) {
    return null
  }
  if (record.role === 'user') {
    const block = text ? withoutReminderText({ type: 'text', text }) : null
    return block ? { id, role: 'user', blocks: [block], timestamp, source: 'transcript' } : null
  }
  if (record.role === 'assistant') {
    // As in the messages log, a thought beside an answer yields to the answer.
    if (text) {
      return {
        id,
        role: 'assistant',
        blocks: [{ type: 'text', text }],
        timestamp,
        source: 'transcript'
      }
    }
    const thought = extractString(message.thinking_content)
    return thought
      ? {
          id,
          role: 'reasoning',
          blocks: [{ type: 'text', text: thought }],
          timestamp,
          source: 'transcript'
        }
      : null
  }
  return null
}

/** mcode serializes a call's arguments and result as JSON; text that is not JSON stays itself. */
function parseMcodeJson(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value
  }
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function mcodeToolResult(value: unknown): unknown {
  const result = parseMcodeJson(value)
  return asRecord(result)?.content ?? result
}

/** mcode spells its calls `toolCall` with `arguments`; translate to the Anthropic shape the block reader knows. */
function normalizeMcodeParts(content: unknown): unknown[] {
  if (!Array.isArray(content)) {
    return [content]
  }
  return content.map((part) => {
    const record = asRecord(part)
    if (record?.type !== 'toolCall') {
      return part
    }
    return { ...record, type: 'tool_use', input: record.arguments }
  })
}

/** Harness context arrives inside the prompt record; strip its wrapper and keep the human text. */
function withoutReminderText(block: NativeChatMessage['blocks'][number]): typeof block | null {
  if (block.type !== 'text') {
    return block
  }
  const text = block.text.replace(/<system-reminder>[\s\S]*?<\/system-reminder>\s*/g, '').trim()
  return text ? { ...block, text } : null
}
