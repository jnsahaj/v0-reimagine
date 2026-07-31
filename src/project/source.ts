import { CliError } from '../errors.js'
import type { ProjectContext, SourceMode } from '../types.js'
import { githubImportReason } from './git.js'

export function chooseSource(
  project: ProjectContext,
  requested: SourceMode,
): { reason?: string; type: 'github' | 'local' } {
  const reason = githubImportReason(project.git)
  if (requested === 'github') {
    if (reason) {
      throw new CliError(`Cannot use GitHub because ${reason}.`, {
        hint: 'Push the current project state, or use --source=local.',
      })
    }
    return { type: 'github' }
  }
  if (requested === 'local') return { type: 'local' }
  return reason ? { type: 'local', reason } : { type: 'github' }
}
