import { acpSelectChoices } from '../acp-select-choices'
import type {
  SessionConfigOption,
  SessionConfigSelectOption
} from '../generated/acp-protocol.generated'
import type { AcpDialect } from './acp-dialect'
import { mcodeModelEfforts, MODEL_DESCRIPTIONS } from './mcode-model-catalog'

function resolveMcodeModelNameAndDescription(choice: SessionConfigSelectOption): {
  name: string
  description?: string
} {
  const rawId = choice.value.replace(/^m:[^:]+:([^:]+)(?::v:.*)?$/, '$1')

  if (rawId === 'MiniMax-M3.1-Flash' || choice.value.includes('MiniMax-M3.1-Flash:')) {
    return {
      name: 'MiniMax M3.1 Flash',
      description: MODEL_DESCRIPTIONS['MiniMax-M3.1-Flash']
    }
  }
  if (
    rawId === 'MiniMax-M3.1-Flash-Preview' ||
    choice.value.includes('MiniMax-M3.1-Flash-Preview:')
  ) {
    return {
      name: 'MiniMax M3.1 Flash Preview',
      description: MODEL_DESCRIPTIONS['MiniMax-M3.1-Flash-Preview']
    }
  }
  if (rawId === 'MiniMax-M3' || choice.value.includes('MiniMax-M3:')) {
    return {
      name: 'MiniMax M3',
      description: MODEL_DESCRIPTIONS['MiniMax-M3']
    }
  }
  if (rawId === 'MiniMax-M2.7-highspeed' || choice.value.includes('MiniMax-M2.7-highspeed:')) {
    return {
      name: 'MiniMax M2.7 Highspeed',
      description: MODEL_DESCRIPTIONS['MiniMax-M2.7-highspeed']
    }
  }
  if (rawId === 'MiniMax-M2.7' || choice.value.includes('MiniMax-M2.7:')) {
    return {
      name: 'MiniMax M2.7',
      description: MODEL_DESCRIPTIONS['MiniMax-M2.7']
    }
  }

  const baseName = choice.name.replace(/\s*·\s*thinking$/, '')
  const name = baseName.startsWith('MiniMax') ? baseName : `MiniMax ${baseName}`
  const description =
    choice.description ??
    MODEL_DESCRIPTIONS[rawId] ??
    (rawId.includes('Flash')
      ? 'Fast and versatile frontier model with deep reasoning'
      : 'Frontier model for complex agentic coding and deep reasoning')

  return { name, description }
}

export function normalizeMcodeConfigOptions(options: SessionConfigOption[]): SessionConfigOption[] {
  return options.map((option) => {
    if (option.type === 'select' && (option.category === 'model' || option.id === 'model')) {
      const choices = acpSelectChoices(option)
      const cleanChoices: SessionConfigSelectOption[] = choices
        .filter(
          (choice) =>
            choice.value.endsWith(':thinking') ||
            !choices.some((other) => other.value === `${choice.value}thinking`)
        )
        .map((choice) => {
          const { name, description } = resolveMcodeModelNameAndDescription(choice)
          return {
            ...choice,
            name,
            ...(description ? { description } : {})
          }
        })

      const fallbackValue = cleanChoices[0]?.value ?? option.currentValue
      const currentValue =
        cleanChoices.find((c) => c.value === option.currentValue)?.value ??
        cleanChoices.find((c) => c.value === `${option.currentValue}thinking`)?.value ??
        fallbackValue

      return {
        ...option,
        currentValue,
        options: cleanChoices
      }
    }
    if (
      option.type === 'select' &&
      (option.category === 'thought_level' || option.id === 'thinkingEffort')
    ) {
      const choices = acpSelectChoices(option).filter((choice) => choice.value !== 'default')
      const currentValue =
        option.currentValue === 'default' || !option.currentValue ? 'high' : option.currentValue
      return {
        ...option,
        currentValue,
        options: choices
      }
    }
    return option
  })
}

export const MCODE_DIALECT: AcpDialect = {
  modelEfforts: mcodeModelEfforts,
  normalizeConfigOptions: normalizeMcodeConfigOptions
}
