import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import type {
  AgentSessionModelOption,
  AgentSessionOptionChoice
} from '../../../shared/agent-session/agent-session-wire'
import type { InitializeResponse } from '../generated/acp-protocol.generated'

export const MCODE_EFFORT_CHOICES: AgentSessionOptionChoice[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'xhigh', label: 'Extra high' },
  { value: 'max', label: 'Max' }
]

const MODEL_DESCRIPTIONS: Readonly<Record<string, string>> = {
  'MiniMax-M3.1-Flash': 'Fast and versatile frontier model with deep reasoning',
  'MiniMax-M3': 'Frontier model for complex agentic coding and deep reasoning'
}

const DEFAULT_MCODE_MODELS: AgentSessionModelOption[] = [
  {
    id: 'm:minimax:MiniMax-M3.1-Flash:v:thinking',
    label: 'MiniMax M3.1 Flash',
    description: MODEL_DESCRIPTIONS['MiniMax-M3.1-Flash'],
    isDefault: true,
    efforts: MCODE_EFFORT_CHOICES,
    defaultEffort: 'high',
    declaredDefaultEffort: 'high'
  },
  {
    id: 'm:minimax:MiniMax-M3:v:thinking',
    label: 'MiniMax M3',
    description: MODEL_DESCRIPTIONS['MiniMax-M3'],
    isDefault: false,
    efforts: MCODE_EFFORT_CHOICES,
    defaultEffort: 'high',
    declaredDefaultEffort: 'high'
  }
]

type McodeProviderConfig = {
  name?: string
  models?: Record<
    string,
    {
      name?: string
      variants?: Record<string, unknown>
      thinking_config?: { mode?: string }
    }
  >
  model_order?: string[]
}

export async function parseMcodeModelCatalogFromConfigFile(
  configPath: string
): Promise<AgentSessionModelOption[]> {
  try {
    const raw = await readFile(configPath, 'utf8')
    const doc = parseYaml(raw) as {
      defaultModel?: string
      provider?: Record<string, McodeProviderConfig>
    }
    const defaultModel = typeof doc.defaultModel === 'string' ? doc.defaultModel : ''
    const results: AgentSessionModelOption[] = []

    const providers = doc.provider ?? {}

    for (const [providerId, provider] of Object.entries(providers)) {
      if (!provider || typeof provider !== 'object' || !provider.models) {
        continue
      }
      const modelEntries = Object.entries(provider.models)
      const order = provider.model_order ?? []
      if (order.length > 0) {
        modelEntries.sort(([a], [b]) => {
          const ia = order.indexOf(a)
          const ib = order.indexOf(b)
          if (ia !== -1 && ib !== -1) {
            return ia - ib
          }
          if (ia !== -1) {
            return -1
          }
          if (ib !== -1) {
            return 1
          }
          return 0
        })
      }

      for (const [modelId, model] of modelEntries) {
        const displayName = model?.name ? `MiniMax ${model.name}` : modelId
        const description =
          MODEL_DESCRIPTIONS[modelId] ??
          (modelId.includes('Flash')
            ? 'Fast and versatile frontier model with deep reasoning'
            : 'Frontier model for complex agentic coding and deep reasoning')

        const isModelDefault =
          defaultModel === `${providerId}/${modelId}` ||
          defaultModel === modelId ||
          modelId === 'MiniMax-M3.1-Flash'

        results.push({
          id: `m:${providerId}:${modelId}:v:thinking`,
          label: displayName,
          description,
          isDefault: isModelDefault,
          efforts: MCODE_EFFORT_CHOICES,
          defaultEffort: 'high',
          declaredDefaultEffort: 'high'
        })
      }
    }

    if (results.length > 0) {
      if (!results.some((m) => m.isDefault)) {
        results[0].isDefault = true
      }
      return results
    }
  } catch {
    // Config read/parse failures fall through to defaults.
  }
  return DEFAULT_MCODE_MODELS
}

export async function readMcodeModelCatalog(
  _initialized: InitializeResponse,
  _connection: { requestSessionFreeExtension(method: string, params: unknown): Promise<unknown> }
): Promise<AgentSessionModelOption[]> {
  const dataDir = process.env.MINIMAX_DATA_DIR?.trim() || join(homedir(), '.minimax')
  const configPath = join(dataDir, 'config.yaml')
  return parseMcodeModelCatalogFromConfigFile(configPath)
}
