import { describe, expect, it } from 'vitest'
import { createMcodeTranscriptDecoder } from './transcript-line-decoders-mcode'

const displayRow = (fields: Record<string, unknown>) =>
  JSON.stringify({ kind: 'message.display_upserted', ...fields })

describe('mcode transcript decoder', () => {
  it('reads a display row into one message whose calls each pair with their result, once per row', () => {
    const decode = createMcodeTranscriptDecoder()
    const calls = [
      {
        tool_call_id: 'c1',
        tool_name: 'ls',
        tool_call_args: '{"path":"."}',
        tool_call_result_data: JSON.stringify({ content: [{ type: 'text', text: 'a.txt' }] }),
        tool_call_status: 2
      },
      {
        tool_call_id: 'c2',
        tool_name: 'read',
        tool_call_args: '{"path":"missing"}',
        tool_call_result_data: 'ENOENT',
        tool_call_status: 3
      }
    ]
    const toolRow = displayRow({
      msgId: 'a1',
      role: 'assistant',
      message: {
        role: 'assistant',
        msg_type: 2,
        msg_content: 'Looking.',
        timestamp: 1_700_000_001_000,
        tool_calls: calls
      }
    })
    const lines = [
      displayRow({
        msgId: 'u1',
        role: 'user',
        message: {
          role: 'user',
          msg_type: 1,
          msg_content: 'List the files <system-reminder>harness note</system-reminder>',
          timestamp: 1_700_000_000_000
        }
      }),
      toolRow,
      // A reopened session writes its recent rows again.
      toolRow,
      displayRow({
        msgId: 't1',
        message: { msg_type: 3, msg_content: '{"eventType":"todos"}', timestamp: 1_700_000_002_000 }
      }),
      // The messages log keeps its own shape, where a result is a row naming its call.
      JSON.stringify({
        message_id: 'r1',
        message: {
          role: 'toolResult',
          toolCallId: 'c9',
          timestamp: 1_700_000_003_000,
          content: [{ type: 'text', text: 'done' }]
        }
      })
    ]

    expect(lines.map((line, index) => decode(line, `fallback-${index}`)).filter(Boolean)).toEqual([
      {
        id: 'u1',
        role: 'user',
        blocks: [{ type: 'text', text: 'List the files' }],
        timestamp: 1_700_000_000_000,
        source: 'transcript'
      },
      {
        id: 'a1',
        role: 'assistant',
        blocks: [
          { type: 'text', text: 'Looking.' },
          { type: 'tool-call', name: 'ls', input: { path: '.' }, callId: 'c1' },
          { type: 'tool-result', callId: 'c1', output: 'a.txt' },
          { type: 'tool-call', name: 'read', input: { path: 'missing' }, callId: 'c2' },
          { type: 'tool-result', callId: 'c2', output: 'ENOENT', isError: true }
        ],
        timestamp: 1_700_000_001_000,
        source: 'transcript'
      },
      {
        id: 'r1',
        role: 'tool',
        blocks: [{ type: 'tool-result', callId: 'c9', output: 'done' }],
        timestamp: 1_700_000_003_000,
        source: 'transcript'
      }
    ])
  })
})
