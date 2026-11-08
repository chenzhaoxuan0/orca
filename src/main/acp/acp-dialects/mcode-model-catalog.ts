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

export const MCODE_ON_OFF_EFFORT_CHOICES: AgentSessionOptionChoice[] = [
  { value: 'off', label: 'Off' },
  { value: 'on', label: 'On' }
]

export const MODEL_DESCRIPTIONS: Readonly<Record<string, string>> = {
  'MiniMax-M3.1-Flash': 'Fast and versatile frontier model with deep reasoning',
  'MiniMax-M3': 'Frontier model for complex agentic coding and deep reasoning',
  'MiniMax-M2.7-highspeed': 'High-speed model for everyday coding and tool use',
  'MiniMax-M2.7': 'Capable model for everyday programming tasks'
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
    efforts: MCODE_ON_OFF_EFFORT_CHOICES,
    defaultEffort: 'on',
    declaredDefaultEffort: 'on'
  }
]

type McodeModelConfig = {
  name?: string
  variants?: Record<string, unknown>
  thinking_config?: { mode?: string; default_value?: string }
  thinking?: {
    effortOptions?: string[]
    defaultEffort?: string
  }
}

type McodeProviderConfig = {
  name?: string
  models?: Record<string, McodeModelConfig>
  model_order?: string[]
}

const DYNAMIC_MODEL_EFFORTS = new Map<
  string,
  {
    efforts: AgentSessionOptionChoice[]
    defaultEffort?: string
    declaredDefaultEffort?: string | null
  }
>()

export function mcodeModelEfforts(model: { modelId: string }): {
  efforts: AgentSessionOptionChoice[]
  defaultEffort?: string
  declaredDefaultEffort?: string | null
} {
  const cached = DYNAMIC_MODEL_EFFORTS.get(model.modelId)
  if (cached) {
    return cached
  }
  const idLower = model.modelId.toLowerCase()
  if (idLower.includes('flash')) {
    return {
      efforts: MCODE_EFFORT_CHOICES,
      defaultEffort: 'high',
      declaredDefaultEffort: 'high'
    }
  }
  if (idLower.includes('m3') || idLower.includes('m2.7')) {
    return {
      efforts: MCODE_ON_OFF_EFFORT_CHOICES,
      defaultEffort: 'on',
      declaredDefaultEffort: 'on'
    }
  }
  return {
    efforts: [],
    declaredDefaultEffort: null
  }
}

export async function parseMcodeModelCatalogFromConfigFile(
  configPath: string
): Promise<AgentSessionModelOption[]> {
  try {
    const raw = await readFile(configPath, 'utf8')
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: YAML parser returns unknown and requires structured typing
    const doc = parseYaml(raw) as {
      defaultModel?: string
      provider?: Record<string, McodeProviderConfig>
    }
    const defaultModel = typeof doc.defaultModel === 'string' ? doc.defaultModel : ''
    const results: AgentSessionModelOption[] = []
    const seenModelKeys = new Set<string>()

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
        if (seenModelKeys.has(modelId) || modelId === 'MiniMax-M3.1-Flash-Preview') {
          continue
        }
        seenModelKeys.add(modelId)

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

        const hasEffortOptions =
          Array.isArray(model?.thinking?.effortOptions) &&
          model.thinking.effortOptions.some((opt) => opt !== 'default')
        const isFlash = modelId.includes('Flash')
        const hasGranularEffort = hasEffortOptions || isFlash
        const isSwitchable =
          model?.thinking_config?.mode === 'switchable' ||
          modelId.includes('M3') ||
          modelId.includes('M2.7')

        const efforts = hasGranularEffort
          ? MCODE_EFFORT_CHOICES
          : isSwitchable
            ? MCODE_ON_OFF_EFFORT_CHOICES
            : []
        const defaultEffort = hasGranularEffort ? 'high' : isSwitchable ? 'on' : undefined
        const declaredDefaultEffort = defaultEffort ?? null

        const fullId = `m:${providerId}:${modelId}:v:thinking`
        const effortMetadata = { efforts, defaultEffort, declaredDefaultEffort }
        DYNAMIC_MODEL_EFFORTS.set(fullId, effortMetadata)
        DYNAMIC_MODEL_EFFORTS.set(modelId, effortMetadata)
        DYNAMIC_MODEL_EFFORTS.set(`m:${providerId}:${modelId}:v:`, effortMetadata)

        results.push({
          id: fullId,
          label: displayName,
          description,
          isDefault: isModelDefault,
          efforts,
          ...(defaultEffort ? { defaultEffort } : {}),
          declaredDefaultEffort
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
