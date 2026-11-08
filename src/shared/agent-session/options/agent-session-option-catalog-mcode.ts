import type { AgentSessionOptionCatalog, CatalogOption } from './agent-session-option-catalog-types'
import { agentChoiceCliApply } from '../../agent-launch/choices/agent-choice-cli-apply'

const MCODE_EFFORT: CatalogOption = {
  id: 'effort',
  label: 'Reasoning effort',
  category: 'thought_level',
  kind: {
    type: 'select',
    choices: [
      { value: 'default', label: 'Default' },
      { value: 'low', label: 'Low' },
      { value: 'medium', label: 'Medium' },
      { value: 'high', label: 'High' },
      { value: 'xhigh', label: 'Xhigh' },
      { value: 'max', label: 'Max' }
    ],
    defaultValue: 'default'
  },
  apply: {
    ...agentChoiceCliApply(
      'mcode',
      [
        {
          kind: 'value',
          names: ['--effort'],
          lift: 'separate-and-long-equals'
        }
      ],
      '--effort'
    ),
    midSession: { kind: 'command', build: (value) => `/effort ${String(value)}` }
  }
}

export function mcodeCliModelFromId(id: string): string {
  const match = /^m:([^:]+):([^:]+):v:(.*)$/.exec(id)
  if (match) {
    const [, provider, model, variant] = match
    return variant ? `${provider}/${model}#${variant}` : `${provider}/${model}`
  }
  return id
}

export const MCODE_SESSION_OPTION_CATALOG: AgentSessionOptionCatalog = {
  supportsWorkerLaunchPreferences: true,
  models: [
    {
      id: 'm:minimax:MiniMax-M3.1-Flash:v:thinking',
      label: 'MiniMax M3.1 Flash (thinking)',
      contextWindowTokens: 1_000_000,
      isDefault: true,
      options: [MCODE_EFFORT]
    },
    {
      id: 'm:minimax:MiniMax-M3.1-Flash:v:',
      label: 'MiniMax M3.1 Flash',
      contextWindowTokens: 1_000_000,
      options: [MCODE_EFFORT]
    },
    {
      id: 'm:minimax:MiniMax-M3:v:thinking',
      label: 'MiniMax M3 (thinking)',
      contextWindowTokens: 1_000_000,
      options: [MCODE_EFFORT]
    },
    {
      id: 'm:minimax:MiniMax-M3:v:',
      label: 'MiniMax M3',
      contextWindowTokens: 1_000_000,
      options: [MCODE_EFFORT]
    }
  ],
  modelApply: {
    cli: [
      {
        kind: 'value',
        names: ['-m', '--model'],
        lift: 'separate-and-long-equals'
      }
    ],
    launchArgs: (value) => ['-m', mcodeCliModelFromId(String(value))],
    midSession: { kind: 'agent-picker', command: '/model' }
  },
  unknownModelOptions: [MCODE_EFFORT]
}
