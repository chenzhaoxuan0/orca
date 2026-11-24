import { join } from 'node:path'
import {
  MCODE_SESSIONS_DIR_SEGMENTS,
  resolveMcodeDataDir
} from '../../shared/agent-launch/environment/mcode-data-dir'
import { resolveSessionFilePath } from '../native-chat/session-file-resolver'
import { directoryTranscriptImport } from '../native-chat/conversation-adoption/structured-agent-cli-conversations'

export const MCODE_TRANSCRIPT_IMPORT = directoryTranscriptImport({
  // Dated per-session folders under the pinned data dir hold one conversation each.
  conversationStore: ({ accountHomePath }) => join(accountHomePath, ...MCODE_SESSIONS_DIR_SEGMENTS),
  // The chat's own home, then the one Session History lists mcode's conversations from.
  accountHomeCandidates: ({ selectedAccountHomePath }) => [
    selectedAccountHomePath,
    resolveMcodeDataDir()
  ],
  // The dated-tree layout lookup stays inside the store; no fallback roots outside it.
  findTranscript: async ({ providerSessionId, store, strictErrors }) =>
    resolveSessionFilePath('mcode', providerSessionId, {
      mcodeSessionsDir: store,
      strictErrors
    })
})
