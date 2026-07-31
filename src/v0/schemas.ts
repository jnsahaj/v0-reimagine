import { z } from 'zod'

export const usageMetricSchema = z.object({
  cacheRead: z.number(),
  cacheWrite: z.number(),
  input: z.number(),
  output: z.number(),
  total: z.number(),
})

export const usageSchema = z.object({
  creditsCost: usageMetricSchema,
  tokens: usageMetricSchema,
})

export const chatSchema = z
  .object({
    authorId: z.string(),
    createdAt: z.string(),
    id: z.string(),
    metadata: z.record(z.string(), z.string()).default({}),
    privacy: z.enum(['public', 'private', 'team', 'team-edit', 'unlisted']),
    title: z.string().optional(),
    updatedAt: z.string().optional(),
    url: z.string().optional(),
    vercelProjectId: z.string().optional(),
    webUrl: z.string().optional(),
    writePermission: z.boolean().default(true),
  })
  .passthrough()

export const importResponseSchema = z.object({
  chat: chatSchema,
  usage: usageSchema,
})

export const messagePartSchema = z.object({ type: z.string() }).passthrough()

export const messageSchema = z
  .object({
    chatId: z.string(),
    content: z.string().default(''),
    finishReason: z.string().nullable(),
    id: z.string(),
    parts: z.array(messagePartSchema).default([]),
    role: z.enum(['user', 'assistant']),
    usage: usageSchema.optional(),
  })
  .passthrough()

export const messageListSchema = z.object({
  messages: z.array(messageSchema),
  cursor: z.string().nullable(),
})

export const chatListSchema = z.object({
  chats: z.array(chatSchema),
  cursor: z.string().nullable(),
})
