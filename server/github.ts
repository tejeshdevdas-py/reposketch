import { Readable } from 'node:stream';
import type { Analysis, Repository } from '../shared/types.js';
import { analyzeRepository } from './analyze.js';
import { readArchive } from './archive.js';

export function parseRepositoryInput(input: string): { owner: string; name: string } {
  const value = input.trim();
  const match =
    /^(?:https:\/\/github\.com\/)?([A-Za-z0-9][A-Za-z0-9-]{0,38})\/([A-Za-z0-9_.-]+)\/?$/.exec(
      value,
    );
  const name = match?.[2].replace(/\.git$/, '');
  if (!match || !name || name === '.' || name === '..' || name.length > 100)
    throw new Error(
      'Enter a public GitHub repository, like https://github.com/owner/repo. Use the repository root, without a branch, query, or subfolder.',
    );
  return { owner: match[1], name };
}

export async function loadRepository(
  input: string,
  fetcher: typeof fetch = fetch,
): Promise<Analysis> {
  const { owner, name } = parseRepositoryInput(input);
  const signal = AbortSignal.timeout(60_000);
  async function request(url: string): Promise<Response> {
    let response: Response;
    try {
      response = await fetcher(url, {
        signal,
        redirect: 'error',
        headers: { 'User-Agent': 'RepoSketch/0.1', Accept: 'application/vnd.github+json' },
      });
    } catch {
      throw new Error(
        signal.aborted
          ? 'GitHub took too long to respond. Try again or use a smaller repository.'
          : 'Could not reach GitHub. Check your connection and repository URL. Renamed repositories need their current URL.',
      );
    }
    if (response.status === 404)
      throw new Error('Repository not found. Check the spelling and make sure it is public.');
    if (response.status === 403 || response.status === 429)
      throw new Error(
        'GitHub rate limit reached or access restricted. Try again later; the sample still works.',
      );
    if (response.status === 409)
      throw new Error('This repository is empty. Choose one with JavaScript or TypeScript source.');
    if (!response.ok)
      throw new Error(`GitHub returned ${response.status}. Please try again later.`);
    return response;
  }
  async function json(url: string): Promise<Record<string, unknown>> {
    const response = await request(url);
    if (!response.body) throw new Error('GitHub returned an empty response.');
    let size = 0;
    const chunks: Uint8Array[] = [];
    const reader = response.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 1024 * 1024) throw new Error('GitHub response exceeded the metadata limit.');
        chunks.push(value);
      }
      const result: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error();
      return result as Record<string, unknown>;
    } catch {
      throw new Error('GitHub returned an invalid or oversized response. Please try again.');
    } finally {
      await reader.cancel().catch(() => {});
    }
  }
  const metadata = await json(`https://api.github.com/repos/${owner}/${name}`);
  if (metadata.private !== false || typeof metadata.default_branch !== 'string')
    throw new Error('GitHub response did not describe a public repository.');
  const revision = await json(
    `https://api.github.com/repos/${owner}/${name}/commits/${encodeURIComponent(metadata.default_branch)}`,
  );
  if (typeof revision.sha !== 'string' || !/^[a-f0-9]{40}$/.test(revision.sha))
    throw new Error('GitHub returned an invalid commit response.');
  const repository: Repository = {
    owner,
    name,
    fullName: `${owner}/${name}`,
    url: `https://github.com/${owner}/${name}`,
    description: typeof metadata.description === 'string' ? metadata.description : '',
    defaultBranch: metadata.default_branch,
    commit: revision.sha,
    stars: typeof metadata.stargazers_count === 'number' ? metadata.stargazers_count : 0,
  };
  const archive = await request(
    `https://codeload.github.com/${owner}/${name}/tar.gz/${revision.sha}`,
  );
  if (!archive.body) throw new Error('GitHub returned an empty archive.');
  const files = await readArchive(
    Readable.fromWeb(archive.body as Parameters<typeof Readable.fromWeb>[0]),
  );
  return analyzeRepository(files, repository);
}
