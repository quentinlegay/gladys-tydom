import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { releaseChangelog } from '../scripts/changelog.js';

const REPO = 'https://github.com/o/r';
const changelog = (unreleased) => `# Changelog

## [Unreleased]
${unreleased}
## [1.0.0] - 2026-01-01

First release.

[Unreleased]: ${REPO}/compare/v1.0.0...HEAD
[1.0.0]: ${REPO}/releases/tag/v1.0.0
`;

test('the Unreleased section becomes the new version, with its link', () => {
  const result = releaseChangelog(changelog('\n### Fixed\n\n- A bug.\n'), '1.1.0', '2026-02-03');
  assert.equal(
    result,
    `# Changelog

## [Unreleased]

## [1.1.0] - 2026-02-03

### Fixed

- A bug.

## [1.0.0] - 2026-01-01

First release.

[Unreleased]: ${REPO}/compare/v1.1.0...HEAD
[1.1.0]: ${REPO}/compare/v1.0.0...v1.1.0
[1.0.0]: ${REPO}/releases/tag/v1.0.0
`,
  );
});

test('an empty Unreleased section is a maintenance release', () => {
  const result = releaseChangelog(changelog('\n'), '1.0.1', '2026-02-03');
  assert.match(result, /## \[1\.0\.1\] - 2026-02-03\n\nMaintenance release/);
});

test('a version already released is refused', () => {
  assert.throws(() => releaseChangelog(changelog('\n'), '1.0.0', '2026-02-03'), /already/);
});

test('the repository changelog can be released', async () => {
  const text = await readFile(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
  const result = releaseChangelog(text, '99.0.0', '2026-12-31');
  assert.match(result, /## \[Unreleased\]\n\n## \[99\.0\.0\] - 2026-12-31\n\n/);
  assert.match(result, /\[99\.0\.0\]: https:\/\/github\.com\/\S+\/compare\/v\S+\.\.\.v99\.0\.0/);
});
