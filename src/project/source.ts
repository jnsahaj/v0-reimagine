import { CliError } from '../errors.js'
import type { ProjectContext, SourceMode } from '../types.js'
import { githubImportNote, githubUnavailableReason } from './git.js'

export function chooseSource(
  project: ProjectContext,
  requested: SourceMode,
): { reason?: string; type: 'github' | 'local' } {
  const unavailable = githubUnavailableReason(project.git)
  if (requested === 'github') {
    if (unavailable) {
      throw new CliError(`Cannot use GitHub because ${unavailable}.`, {
        hint: 'Add a GitHub remote, or use --source=local.',
      })
    }
    const note = project.git ? githubImportNote(project.git) : undefined
    return { type: 'github', ...(note ? { reason: note } : {}) }
  }
  if (requested === 'local') return { type: 'local' }
  if (!unavailable && project.git) {
    const note = githubImportNote(project.git)
    return { type: 'github', ...(note ? { reason: note } : {}) }
  }
  return { type: 'local', ...(unavailable ? { reason: unavailable } : {}) }
}
