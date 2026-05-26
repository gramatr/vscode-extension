// gramatr VS Code Extension — Git Context Extraction
import * as vscode from 'vscode';
import { parseGitRemote } from '@gramatr/core/project-slug';

export interface ProjectJson {
  project_id: string;
  project_slug?: string;
}

export interface GitContext {
  projectId: string;
  branch: string;
  projectUuid?: string;
}

/**
 * Try to read `.gramatr/project.json` from the workspace root.
 * Returns the parsed content or null if not found / invalid.
 */
export async function readProjectJson(): Promise<ProjectJson | null> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    return null;
  }

  try {
    const projectJsonUri = vscode.Uri.joinPath(folders[0].uri, '.gramatr', 'project.json');
    const bytes = await vscode.workspace.fs.readFile(projectJsonUri);
    const text = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (typeof parsed.project_id === 'string' && parsed.project_id.length > 0) {
      return {
        project_id: parsed.project_id,
        project_slug: typeof parsed.project_slug === 'string' ? parsed.project_slug : undefined,
      };
    }
    return null;
  } catch {
    // File doesn't exist or is invalid — not an error
    return null;
  }
}

/**
 * Write `.gramatr/project.json` to the workspace root.
 * Creates the `.gramatr` directory if it doesn't exist.
 */
export async function writeProjectJson(data: ProjectJson): Promise<void> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    return;
  }

  try {
    const gramatrDir = vscode.Uri.joinPath(folders[0].uri, '.gramatr');
    try {
      await vscode.workspace.fs.stat(gramatrDir);
    } catch {
      await vscode.workspace.fs.createDirectory(gramatrDir);
    }
    const projectJsonUri = vscode.Uri.joinPath(gramatrDir, 'project.json');
    const content = JSON.stringify(data, null, 2) + '\n';
    await vscode.workspace.fs.writeFile(projectJsonUri, new TextEncoder().encode(content));
  } catch {
    // Best-effort — don't break the session if we can't write
  }
}

/**
 * Extract git context (project_id and branch) from the workspace.
 * Uses VS Code's built-in git extension. Falls back to workspace folder name.
 */
export function getGitContext(): GitContext {
  const fallback: GitContext = {
    projectId: getWorkspaceFolderName(),
    branch: 'unknown',
  };

  try {
    const gitExtension = vscode.extensions.getExtension<GitExtensionApi>('vscode.git');
    if (!gitExtension?.isActive) {
      return fallback;
    }

    const git = gitExtension.exports.getAPI(1);
    const repos = git.repositories;
    if (repos.length === 0) {
      return fallback;
    }

    const repo = repos[0];

    // Extract project_id from origin remote
    const origin = repo.state.remotes.find(
      (r: { name: string }) => r.name === 'origin'
    );
    const projectId = origin
      ? (parseGitRemote(origin.fetchUrl ?? origin.pushUrl ?? '') ?? fallback.projectId)
      : fallback.projectId;

    // Current branch
    const branch = repo.state.HEAD?.name ?? fallback.branch;

    return { projectId: projectId || fallback.projectId, branch };
  } catch {
    return fallback;
  }
}

/** Fallback: use the workspace folder name as project ID */
function getWorkspaceFolderName(): string {
  const folders = vscode.workspace.workspaceFolders;
  if (folders && folders.length > 0) {
    return folders[0].name;
  }
  return 'unknown-project';
}

// Minimal type declarations for the VS Code git extension API
interface GitExtensionApi {
  getAPI(version: 1): GitApi;
}

interface GitApi {
  repositories: GitRepository[];
}

interface GitRepository {
  state: {
    HEAD?: { name?: string };
    remotes: Array<{
      name: string;
      fetchUrl?: string;
      pushUrl?: string;
    }>;
  };
}
