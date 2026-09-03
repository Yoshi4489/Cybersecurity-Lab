import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dockerfileRoots = ['lab-target', 'toolbox', 'standalone-labs'];
const pinnedExternalImage = /^(?:--platform=\S+\s+)?\S+:\S+@sha256:[a-f0-9]{64}$/;

async function dockerfilesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return dockerfilesUnder(entryPath);
    return entry.isFile() && entry.name === 'Dockerfile' ? [entryPath] : [];
  }));
  return nested.flat();
}

test('external Dockerfile bases are immutable digest-pinned', async () => {
  const dockerfiles = (await Promise.all(
    dockerfileRoots.map((root) => dockerfilesUnder(path.join(repositoryRoot, root))),
  )).flat();
  const violations = [];

  for (const dockerfile of dockerfiles) {
    const stages = new Set();
    const lines = (await readFile(dockerfile, 'utf8')).split(/\r?\n/);
    for (const [index, line] of lines.entries()) {
      const match = line.match(/^\s*FROM\s+(?:--platform=\S+\s+)?(\S+)(?:\s+AS\s+(\S+))?\s*$/i);
      if (!match) continue;
      const [, image, stageName] = match;
      if (!stages.has(image) && !pinnedExternalImage.test(line.trim().replace(/^FROM\s+/i, ''))) {
        violations.push(`${path.relative(repositoryRoot, dockerfile)}:${index + 1}: ${image}`);
      }
      if (stageName) stages.add(stageName);
    }
  }

  assert.deepEqual(violations, []);
});
