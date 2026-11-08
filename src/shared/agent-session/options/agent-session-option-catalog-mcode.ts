import type { AgentSessionOptionCatalog, CatalogOption } from './agent-session-option-catalog-types'
import { agentChoiceCliApply } from '../../agent-launch/choices/agent-choice-cli-apply'

export const MCODE_EFFORT_CHOICES = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'xhigh', label: 'Extra high' },
  { value: 'max', label: 'Max' }
]

export const MCODE_EFFORT: CatalogOption = {
  id: 'effort',
  label: 'Reasoning effort',
  category: 'thought_level',
  kind: {
    type: 'select',
    choices: MCODE_EFFORT_CHOICES,
    defaultValue: 'high'
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

export const MCODE_ON_OFF_EFFORT_CHOICES = [
  { value: 'off', label: 'Off' },
  { value: 'on', label: 'On' }
]

export const MCODE_ON_OFF_EFFORT: CatalogOption = {
  id: 'effort',
  label: 'Reasoning effort',
  category: 'thought_level',
  kind: {
    type: 'select',
    choices: MCODE_ON_OFF_EFFORT_CHOICES,
    defaultValue: 'on'
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
  hostListingNamesConfiguredModel: true,
  models: [
    {
      id: 'm:minimax:MiniMax-M3.1-Flash:v:thinking',
      label: 'MiniMax M3.1 Flash',
      description: 'Fast and versatile frontier model with deep reasoning',
      contextWindowTokens: 1_000_000,
      isDefault: true,
      options: [MCODE_EFFORT]
    },
    {
      id: 'm:minimax:MiniMax-M3:v:thinking',
      label: 'MiniMax M3',
      description: 'Frontier model for complex agentic coding and deep reasoning',
      contextWindowTokens: 1_000_000,
      options: [MCODE_ON_OFF_EFFORT]
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
  unknownModelOptions: []
}
