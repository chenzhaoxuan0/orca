import type { AiVaultAgentSource } from '../../discovery/session-scanner-agent-sources'
import { sessionRootDirs } from '../../discovery/session-scanner-roots'
import {
  MCODE_SESSIONS_HOME_SEGMENTS,
  mcodeSessionsDir
} from '../../../../shared/agent-launch/environment/mcode-data-dir'
import {
  mcodeDisplayLogPathForManifest,
  mcodeMessagesPathForManifest
} from '../../../../shared/ai-vault/session-display/ai-vault-session-log-resource'
import { isMissingTranscriptPathError } from '../../discovery/session-path-absence'
import { wslGatedStat } from '../../../native-chat/transcript-filesystem/wsl-transcript-fs-access'
import { isMcodeSessionManifestPath } from './session-scanner-mcode-parser'

/** Only the date tree and its session folders can hold a session; depth 0 is a root child. */
export function isMcodeSessionTreeDirectory(name: string, depth: number): boolean {
  return depth < 3 ? /^\d+$/.test(name) : name.includes('-session_')
}

/** The log the parser reads: the messages log, or the display log runtimes before it kept. */
async function mcodeSessionLogPath(manifestPath: string): Promise<string> {
  const messages = mcodeMessagesPathForManifest(manifestPath)
  try {
    await wslGatedStat(messages, 'scan')
    return messages
  } catch (error) {
    return isMissingTranscriptPathError(error)
      ? mcodeDisplayLogPathForManifest(manifestPath)
      : messages
  }
}

/** The log a session's turns are read from: the messages log it kept, or the display log found for it. */
export async function mcodeTranscriptLog(log: string, signal?: AbortSignal): Promise<string> {
  const messages = mcodeMessagesPathForManifest(log)
  try {
    return (await wslGatedStat(messages, 'exact', signal)).isFile() ? messages : log
  } catch {
    signal?.throwIfAborted()
    return log
  }
}

export const MCODE_AGENT_SOURCE: AiVaultAgentSource = {
  rootDirs: (options, wslHomeDirs) =>
    sessionRootDirs(
      options.mcodeSessionsDir ?? mcodeSessionsDir(),
      wslHomeDirs,
      MCODE_SESSIONS_HOME_SEGMENTS
    ),
  extensions: ['.json'],
  filePredicate: isMcodeSessionManifestPath,
  // Appends to whichever log a session keeps must invalidate its cached manifest row.
  contentDependencyPath: mcodeSessionLogPath,
  directoryPredicate: isMcodeSessionTreeDirectory
}
