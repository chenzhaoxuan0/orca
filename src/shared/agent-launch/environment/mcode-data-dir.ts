import { homedir } from 'node:os'
import { join } from 'node:path'
import { resolveAbsoluteDirOverride } from '../../file-access/absolute-dir-override'

/** The dated session tree inside mcode's data dir. */
export const MCODE_SESSIONS_DIR_SEGMENTS = ['v2', 'sessions'] as const

/** Default-home-relative segments of the same tree, for default-root and WSL discovery. */
export const MCODE_SESSIONS_HOME_SEGMENTS = ['.minimax', ...MCODE_SESSIONS_DIR_SEGMENTS] as const

/** mcode resolves MINIMAX_DATA_DIR, then its MAVIS_DATA_DIR alias, then ~/.minimax. */
export function resolveMcodeDataDir(env: NodeJS.ProcessEnv = process.env): string {
  return resolveAbsoluteDirOverride(
    env.MINIMAX_DATA_DIR?.trim() || env.MAVIS_DATA_DIR?.trim(),
    join(homedir(), '.minimax')
  )
}

/** Dated per-session folders under the data dir hold mcode's TUI and ACP transcripts. */
export function mcodeSessionsDir(env: NodeJS.ProcessEnv = process.env): string {
  return join(resolveMcodeDataDir(env), ...MCODE_SESSIONS_DIR_SEGMENTS)
}
