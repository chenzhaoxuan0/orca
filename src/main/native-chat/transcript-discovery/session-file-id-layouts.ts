import { win32 } from 'node:path'
import { GROK_CHAT_HISTORY_FILE } from '../../../shared/agent-hook-listener/providers/grok/grok-session-paths'
import { isClaudeProjectBucketDirectory } from '../../ai-vault/scanners/claude/claude-project-dir-encoding'
import { isOmpConversationDirectory } from '../../ai-vault/scanners/omp/session-scanner-omp-subagent-transcripts'
import { isMcodeSessionTreeDirectory } from '../../ai-vault/scanners/mcode/mcode-session-layout'
import {
  MCODE_DISPLAY_LOG,
  MCODE_MESSAGES_LOG
} from '../../../shared/ai-vault/session-display/ai-vault-session-log-resource'

export type SessionIdLookupAgent = 'claude' | 'codex' | 'grok' | 'omp' | 'mcode'

export type SessionFileIdLayout = {
  fileMatchesId: (path: string, sessionId: string) => boolean
  /** depth 0 is a direct root child; false prunes this directory. */
  directoryPredicate?: (name: string, depth: number, wanted: (id: string) => boolean) => boolean
}

// win32 parsing handles both native and WSL UNC separators.
function stem(path: string): string {
  return win32.basename(path, win32.extname(path))
}

export const SESSION_FILE_ID_LAYOUTS: Record<SessionIdLookupAgent, SessionFileIdLayout> = {
  claude: {
    fileMatchesId: (path, id) => win32.basename(path) === `${id}.jsonl`,
    directoryPredicate: isClaudeProjectBucketDirectory
  },
  codex: {
    fileMatchesId: (path, id) => {
      const name = stem(path)
      return name === id || name.endsWith(`-${id}`)
    }
  },
  grok: {
    fileMatchesId: (path, id) =>
      win32.basename(path) === GROK_CHAT_HISTORY_FILE && win32.basename(win32.dirname(path)) === id,
    directoryPredicate: (name, depth, wanted) => depth === 0 || (depth === 1 && wanted(name))
  },
  omp: {
    fileMatchesId: (path, id) => {
      const name = stem(path)
      return name === id || name.endsWith(`_${id}`)
    },
    // Prune subagent artifact directories: their suffix can match the parent ID and steal its transcript.
    directoryPredicate: isOmpConversationDirectory
  },
  mcode: {
    // Dated folders name the session as a base64 suffix: <stamp>-session_<b64(id)>/<log>.jsonl.
    // A session keeps a messages log, or the display log runtimes before it kept.
    fileMatchesId: (path, id) => {
      const name = win32.basename(path)
      return (
        (name === MCODE_MESSAGES_LOG || name === MCODE_DISPLAY_LOG) &&
        win32
          .basename(win32.dirname(path))
          .endsWith(`-session_${Buffer.from(id, 'utf8').toString('base64')}`)
      )
    },
    directoryPredicate: isMcodeSessionTreeDirectory
  }
}
