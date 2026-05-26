// gramatr VS Code Extension — Project (Git Context) Tests
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetExtension = vi.fn();
const mockWorkspaceFolders = vi.fn();
const mockReadFile = vi.fn();
const mockWriteFile = vi.fn();
const mockStat = vi.fn();
const mockCreateDirectory = vi.fn();

vi.mock('vscode', () => ({
  extensions: {
    getExtension: (...args: unknown[]) => mockGetExtension(...args),
  },
  workspace: {
    get workspaceFolders() {
      return mockWorkspaceFolders();
    },
    fs: {
      readFile: (...args: unknown[]) => mockReadFile(...args),
      writeFile: (...args: unknown[]) => mockWriteFile(...args),
      stat: (...args: unknown[]) => mockStat(...args),
      createDirectory: (...args: unknown[]) => mockCreateDirectory(...args),
    },
  },
  Uri: {
    joinPath: (base: { fsPath: string }, ...segments: string[]) => ({
      fsPath: [base.fsPath, ...segments].join('/'),
    }),
  },
}));

import { getGitContext, readProjectJson, writeProjectJson } from '../../src/session/project';

describe('getGitContext', () => {
  beforeEach(() => {
    mockGetExtension.mockReset();
    mockWorkspaceFolders.mockReset();
    mockWorkspaceFolders.mockReturnValue([{ name: 'my-project', uri: { fsPath: '/workspace/my-project' } }]);
  });

  it('falls back to workspace folder name when git extension is not present', () => {
    mockGetExtension.mockReturnValue(null);
    const ctx = getGitContext();
    expect(ctx.projectId).toBe('my-project');
    expect(ctx.branch).toBe('unknown');
  });

  it('falls back when git extension is not active', () => {
    mockGetExtension.mockReturnValue({ isActive: false, exports: {} });
    const ctx = getGitContext();
    expect(ctx.projectId).toBe('my-project');
    expect(ctx.branch).toBe('unknown');
  });

  it('falls back when no repositories exist', () => {
    mockGetExtension.mockReturnValue({
      isActive: true,
      exports: {
        getAPI: () => ({ repositories: [] }),
      },
    });
    const ctx = getGitContext();
    expect(ctx.projectId).toBe('my-project');
    expect(ctx.branch).toBe('unknown');
  });

  it('extracts SSH remote URL into owner/repo format', () => {
    mockGetExtension.mockReturnValue({
      isActive: true,
      exports: {
        getAPI: () => ({
          repositories: [
            {
              state: {
                HEAD: { name: 'main' },
                remotes: [
                  { name: 'origin', fetchUrl: 'git@github.com:gramatr/gramatr.git' },
                ],
              },
            },
          ],
        }),
      },
    });

    const ctx = getGitContext();
    expect(ctx.projectId).toBe('gramatr/gramatr');
    expect(ctx.branch).toBe('main');
  });

  it('extracts HTTPS remote URL into owner/repo format', () => {
    mockGetExtension.mockReturnValue({
      isActive: true,
      exports: {
        getAPI: () => ({
          repositories: [
            {
              state: {
                HEAD: { name: 'develop' },
                remotes: [
                  { name: 'origin', fetchUrl: 'https://github.com/owner/repo.git' },
                ],
              },
            },
          ],
        }),
      },
    });

    const ctx = getGitContext();
    expect(ctx.projectId).toBe('owner/repo');
    expect(ctx.branch).toBe('develop');
  });

  it('uses pushUrl when fetchUrl is absent', () => {
    mockGetExtension.mockReturnValue({
      isActive: true,
      exports: {
        getAPI: () => ({
          repositories: [
            {
              state: {
                HEAD: { name: 'feat' },
                remotes: [
                  { name: 'origin', pushUrl: 'git@github.com:org/project.git' },
                ],
              },
            },
          ],
        }),
      },
    });

    const ctx = getGitContext();
    expect(ctx.projectId).toBe('org/project');
    expect(ctx.branch).toBe('feat');
  });

  it('falls back to workspace name when remote URL is unparseable', () => {
    mockGetExtension.mockReturnValue({
      isActive: true,
      exports: {
        getAPI: () => ({
          repositories: [
            {
              state: {
                HEAD: { name: 'feature/x' },
                remotes: [
                  { name: 'origin', fetchUrl: 'some-random-string' },
                ],
              },
            },
          ],
        }),
      },
    });

    const ctx = getGitContext();
    expect(ctx.projectId).toBe('my-project');
    expect(ctx.branch).toBe('feature/x');
  });

  it('falls back to workspace name when no origin remote exists', () => {
    mockGetExtension.mockReturnValue({
      isActive: true,
      exports: {
        getAPI: () => ({
          repositories: [
            {
              state: {
                HEAD: { name: 'main' },
                remotes: [
                  { name: 'upstream', fetchUrl: 'git@github.com:other/repo.git' },
                ],
              },
            },
          ],
        }),
      },
    });

    const ctx = getGitContext();
    expect(ctx.projectId).toBe('my-project');
    expect(ctx.branch).toBe('main');
  });

  it('falls back branch to unknown when HEAD has no name', () => {
    mockGetExtension.mockReturnValue({
      isActive: true,
      exports: {
        getAPI: () => ({
          repositories: [
            {
              state: {
                HEAD: {},
                remotes: [
                  { name: 'origin', fetchUrl: 'git@github.com:a/b.git' },
                ],
              },
            },
          ],
        }),
      },
    });

    const ctx = getGitContext();
    expect(ctx.projectId).toBe('a/b');
    expect(ctx.branch).toBe('unknown');
  });

  it('returns unknown-project when no workspace folders exist', () => {
    mockGetExtension.mockReturnValue(null);
    mockWorkspaceFolders.mockReturnValue(null);
    const ctx = getGitContext();
    expect(ctx.projectId).toBe('unknown-project');
  });

  it('returns unknown-project when workspace folders array is empty', () => {
    mockGetExtension.mockReturnValue(null);
    mockWorkspaceFolders.mockReturnValue([]);
    const ctx = getGitContext();
    expect(ctx.projectId).toBe('unknown-project');
  });

  it('returns fallback on unexpected error inside try block', () => {
    mockGetExtension.mockReturnValue({
      isActive: true,
      exports: {
        getAPI: () => { throw new Error('git API broke'); },
      },
    });
    const ctx = getGitContext();
    expect(ctx.projectId).toBe('my-project');
    expect(ctx.branch).toBe('unknown');
  });
});

describe('readProjectJson', () => {
  beforeEach(() => {
    mockWorkspaceFolders.mockReset();
    mockReadFile.mockReset();
    mockWorkspaceFolders.mockReturnValue([{ name: 'my-project', uri: { fsPath: '/workspace/my-project' } }]);
  });

  it('returns parsed project_id from valid project.json', async () => {
    const content = JSON.stringify({ project_id: 'abc-uuid-123', project_slug: 'owner/repo' });
    mockReadFile.mockResolvedValue(new TextEncoder().encode(content));

    const result = await readProjectJson();
    expect(result).toEqual({ project_id: 'abc-uuid-123', project_slug: 'owner/repo' });
  });

  it('returns null when project.json has no project_id', async () => {
    const content = JSON.stringify({ project_slug: 'owner/repo' });
    mockReadFile.mockResolvedValue(new TextEncoder().encode(content));

    const result = await readProjectJson();
    expect(result).toBeNull();
  });

  it('returns null when project_id is empty string', async () => {
    const content = JSON.stringify({ project_id: '' });
    mockReadFile.mockResolvedValue(new TextEncoder().encode(content));

    const result = await readProjectJson();
    expect(result).toBeNull();
  });

  it('returns null when file does not exist', async () => {
    mockReadFile.mockRejectedValue(new Error('File not found'));

    const result = await readProjectJson();
    expect(result).toBeNull();
  });

  it('returns null when no workspace folders', async () => {
    mockWorkspaceFolders.mockReturnValue(null);

    const result = await readProjectJson();
    expect(result).toBeNull();
  });

  it('returns null when workspace folders is empty', async () => {
    mockWorkspaceFolders.mockReturnValue([]);

    const result = await readProjectJson();
    expect(result).toBeNull();
  });

  it('omits project_slug when not a string', async () => {
    const content = JSON.stringify({ project_id: 'uuid-1', project_slug: 42 });
    mockReadFile.mockResolvedValue(new TextEncoder().encode(content));

    const result = await readProjectJson();
    expect(result).toEqual({ project_id: 'uuid-1', project_slug: undefined });
  });
});

describe('writeProjectJson', () => {
  beforeEach(() => {
    mockWorkspaceFolders.mockReset();
    mockWriteFile.mockReset();
    mockStat.mockReset();
    mockCreateDirectory.mockReset();
    mockWorkspaceFolders.mockReturnValue([{ name: 'my-project', uri: { fsPath: '/workspace/my-project' } }]);
  });

  it('writes project.json with correct content', async () => {
    mockStat.mockResolvedValue({});
    mockWriteFile.mockResolvedValue(undefined);

    await writeProjectJson({ project_id: 'uuid-1', project_slug: 'owner/repo' });

    expect(mockWriteFile).toHaveBeenCalledTimes(1);
    const writtenBytes = mockWriteFile.mock.calls[0][1] as Uint8Array;
    const written = new TextDecoder().decode(writtenBytes);
    const parsed = JSON.parse(written);
    expect(parsed.project_id).toBe('uuid-1');
    expect(parsed.project_slug).toBe('owner/repo');
  });

  it('creates .gramatr directory if it does not exist', async () => {
    mockStat.mockRejectedValue(new Error('Not found'));
    mockCreateDirectory.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);

    await writeProjectJson({ project_id: 'uuid-2' });

    expect(mockCreateDirectory).toHaveBeenCalledTimes(1);
    expect(mockWriteFile).toHaveBeenCalledTimes(1);
  });

  it('does nothing when no workspace folders', async () => {
    mockWorkspaceFolders.mockReturnValue(null);

    await writeProjectJson({ project_id: 'uuid-3' });

    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it('swallows write errors gracefully', async () => {
    mockStat.mockResolvedValue({});
    mockWriteFile.mockRejectedValue(new Error('Permission denied'));

    // Should not throw
    await writeProjectJson({ project_id: 'uuid-4' });
  });
});
