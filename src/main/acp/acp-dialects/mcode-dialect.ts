import { acpSelectChoices } from '../acp-select-choices'
import type {
  SessionConfigOption,
  SessionConfigSelectOption
} from '../generated/acp-protocol.generated'
import type { AcpDialect } from './acp-dialect'

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
          const isFlash = choice.value.includes('Flash')
          const name = isFlash ? 'MiniMax M3.1 Flash' : 'MiniMax M3'
          const description = isFlash
            ? 'Fast and versatile frontier model with deep reasoning'
            : 'Frontier model for complex agentic coding and deep reasoning'
          return {
            ...choice,
            name,
            description
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
    if (option.type === 'select' && option.category === 'thought_level') {
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
  normalizeConfigOptions: normalizeMcodeConfigOptions
}
