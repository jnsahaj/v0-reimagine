import type { ProjectContext } from '../types.js'

export function buildSystemPrompt(project: ProjectContext): string {
  const vercelContext = project.vercel.projectId
    ? `The local project is linked to Vercel project ${project.vercel.projectId}${project.vercel.orgId ? ` in team/scope ${project.vercel.orgId}` : ''}. Preserve its environment-variable names, integrations, build settings, runtime assumptions, and deployment behavior. Never expose or invent secret values.`
    : 'Preserve the project’s existing deployment and environment-variable assumptions.'
  const focus =
    project.relativeProjectRoot && project.relativeProjectRoot !== '.'
      ? `This is a monorepo. Focus the reimagination on ${project.relativeProjectRoot} and only change shared packages when necessary for that application.`
      : 'Treat the imported repository root as the application scope.'

  return `You are reimagining an existing web product, not creating a throwaway replacement.

First inspect the project, its routes, components, styles, design tokens, assets, and primary user journeys. Then implement a cohesive, production-quality visual reimagination.

Preserve all working functionality, routes, copy, data flows, API calls, authentication, framework conventions, integrations, and meaningful brand assets. Do not replace real behavior with mock data. Do not rewrite the backend or change public contracts unless required to keep the existing application working.

Concentrate changes on information hierarchy, layout, navigation, typography, color, spacing, component composition, interaction states, responsive behavior, accessibility, and tasteful motion. The result should feel deliberate, distinctive, polished, and consistent across the primary routes—not like a generic template.

Reuse the existing stack and design-system foundations where possible. Add UI dependencies only when they materially improve the result and are compatible with the project. Do not stop in plan mode, do not ask for plan approval, and do not return an explanation-only response. You must make substantive application UI file edits in this run. Run the project’s existing checks or build and fix issues introduced by your changes.

${focus}
${vercelContext}

Conclude with a concise summary of the design direction, important changes, and verification performed.`
}

export function buildUserPrompt(userPrompt?: string): string {
  const base =
    'Reimagine this website with a strong, coherent art direction and production-quality execution while preserving how the product works.'
  return userPrompt?.trim()
    ? `${base}\n\nAdditional creative direction from the user:\n${userPrompt.trim()}`
    : base
}
