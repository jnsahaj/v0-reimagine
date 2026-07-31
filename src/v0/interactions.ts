import checkbox from '@inquirer/checkbox'
import confirm from '@inquirer/confirm'
import input from '@inquirer/input'
import select from '@inquirer/select'
import { CliError } from '../errors.js'
import type { CliOptions, V0Message, V0MessagePart } from '../types.js'
import type { Output } from '../ui/output.js'
import type { V0Client } from './client.js'

export async function resolveInteractions(options: {
  chatUrl: string
  client: V0Client
  cli: CliOptions
  message?: V0Message
  output: Output
}): Promise<V0Message | undefined> {
  let message = options.message
  for (let round = 0; message && round < 5; round += 1) {
    const interaction = findInteraction(message.parts)
    if (!interaction) return message

    if (options.cli.nonInteractive && interaction.kind !== 'plan') {
      options.output.warn(`v0 is waiting for user input. Continue in ${options.chatUrl}`)
      return message
    }

    let task: Record<string, unknown> | undefined
    if (interaction.kind === 'plan') {
      const approved = options.cli.yes
        ? true
        : options.cli.nonInteractive
          ? false
          : await confirm({ message: 'Approve v0’s implementation plan?', default: true })
      if (!approved) {
        options.output.warn(`Plan approval is pending. Continue in ${options.chatUrl}`)
        return message
      }
      task = {
        type: 'plan-exit-response',
        status: 'approved',
        content: 'Proceed with the implementation and verification.',
      }
    } else if (interaction.kind === 'permissions') {
      const approved = await confirm({
        message: `Allow v0 to run ${interaction.permissions.length} requested project action(s)?`,
        default: false,
      })
      if (!approved) {
        options.output.warn(
          `Permission approval is pending. Continue in ${options.chatUrl}`,
        )
        return message
      }
      task = { type: 'confirmed-permissions', permissions: interaction.permissions }
    } else {
      const answers = []
      for (const question of interaction.questions) {
        const choices = question.options.map((choice) => ({
          name: choice.description
            ? `${choice.label} — ${choice.description}`
            : choice.label,
          value: choice.label,
        }))
        if (question.multiSelect) {
          const selectedLabels = await checkbox({ message: question.question, choices })
          answers.push({
            questionId: question.id,
            questionText: question.question,
            selectedLabels,
          })
        } else if (choices.length > 0) {
          const selectedLabel = await select({ message: question.question, choices })
          answers.push({
            questionId: question.id,
            questionText: question.question,
            selectedLabels: [selectedLabel],
          })
        } else {
          const customText = await input({ message: question.question })
          answers.push({
            questionId: question.id,
            questionText: question.question,
            selectedLabels: [],
            customText,
          })
        }
      }
      task = { type: 'answered-questions', answers }
    }

    options.output.spinner('Continuing the v0 reimagination…')
    message = await options.client.resolveTask(message.chatId, task)
  }
  if (message && findInteraction(message.parts)) {
    throw new CliError('v0 requested too many consecutive interactions.', {
      hint: `Continue in ${options.chatUrl}`,
    })
  }
  return message
}

type Question = {
  id: string
  multiSelect: boolean
  options: Array<{ description?: string; label: string }>
  question: string
}

type Interaction =
  | { kind: 'plan' }
  | { kind: 'permissions'; permissions: unknown[] }
  | { kind: 'questions'; questions: Question[] }

function findInteraction(parts: V0MessagePart[]): Interaction | undefined {
  for (const part of parts) {
    if (part.type === 'agent-action' && part.name === 'exit_plan_mode')
      return { kind: 'plan' }
    if (part.type === 'agent-action' && part.name === 'ask_user_questions') {
      const questions = parseQuestions(part.data)
      if (questions.length > 0) return { kind: 'questions', questions }
    }
    if (
      part.type === 'tool-call' &&
      Array.isArray(part.suggestedPermissions) &&
      part.suggestedPermissions.length > 0
    ) {
      return { kind: 'permissions', permissions: part.suggestedPermissions }
    }
  }
  return undefined
}

function parseQuestions(data: unknown): Question[] {
  if (!isRecord(data) || !Array.isArray(data.questions)) return []
  return data.questions.flatMap((value) => {
    if (
      !isRecord(value) ||
      typeof value.id !== 'string' ||
      typeof value.question !== 'string'
    ) {
      return []
    }
    const options = Array.isArray(value.options)
      ? value.options.flatMap((option) => {
          if (!isRecord(option) || typeof option.label !== 'string') return []
          return [
            {
              label: option.label,
              ...(typeof option.description === 'string'
                ? { description: option.description }
                : {}),
            },
          ]
        })
      : []
    return [
      {
        id: value.id,
        multiSelect: value.multiSelect === true,
        options,
        question: value.question,
      },
    ]
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
