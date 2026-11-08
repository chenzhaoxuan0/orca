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
  const modelOption = options.find(
    (opt) => opt.type === 'select' && (opt.category === 'model' || opt.id === 'model')
  )
  const rawModelValue = modelOption?.type === 'select' ? modelOption.currentValue : ''
  const isOff = rawModelValue.endsWith(':v:')
  const isSwitchable =
    rawModelValue.includes('MiniMax-M3:') ||
    rawModelValue.includes('MiniMax-M2.7:') ||
    rawModelValue.includes('MiniMax-M2.7-highspeed:')

  let hasThoughtLevel = false

  const normalized = options.map((option) => {
    if (option.type === 'select' && (option.category === 'model' || option.id === 'model')) {
      const choices = acpSelectChoices(option)
      const cleanChoices: SessionConfigSelectOption[] = choices
        .filter(
          (choice) =>
            !choice.value.includes('MiniMax-M3.1-Flash-Preview') &&
            !choice.value.includes('custom_provider') &&
            (choice.value.endsWith(':thinking') ||
              !choices.some((other) => other.value === `${choice.value}thinking`))
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
      hasThoughtLevel = true
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

  if (!hasThoughtLevel && isSwitchable) {
    normalized.push({
      type: 'select',
      id: 'thinkingEffort',
      name: 'Thinking effort',
      description: 'Controls whether thinking is enabled for this model.',
      category: 'thought_level',
      currentValue: isOff ? 'off' : 'on',
      options: [
        { value: 'off', name: 'Off' },
        { value: 'on', name: 'On' }
      ]
    })
  }

  return normalized
}

export const MCODE_DIALECT: AcpDialect = {
  effortChangesModel: true,
  modelEfforts: mcodeModelEfforts,
  normalizeConfigOptions: normalizeMcodeConfigOptions
}
