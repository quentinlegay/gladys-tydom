// -----------------------------------------------------------------------------
// Release helper: turn the `Unreleased` section of CHANGELOG.md into the new
// version, and add its comparison link.
//
//   node scripts/changelog.js <version> [YYYY-MM-DD]
//
// Run by the Release workflow right after the version bump.
// -----------------------------------------------------------------------------

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const UNRELEASED_HEADING = '## [Unreleased]';
const UNRELEASED_LINK = /^\[Unreleased\]: (\S+)\/compare\/(\S+)\.\.\.HEAD$/m;

/**
 * Pure: the changelog text with `version` released on `date`. An empty
 * `Unreleased` section becomes a maintenance release.
 */
export function releaseChangelog(text, version, date) {
  const start = text.indexOf(UNRELEASED_HEADING);
  if (start === -1) throw new Error(`CHANGELOG.md has no "${UNRELEASED_HEADING}" section`);
  if (text.includes(`## [${version}]`)) throw new Error(`CHANGELOG.md already has ${version}`);
  const link = text.match(UNRELEASED_LINK);
  if (!link) throw new Error('CHANGELOG.md has no "[Unreleased]: …/compare/<tag>...HEAD" link');
  const [line, repoUrl, previousTag] = link;

  const bodyStart = start + UNRELEASED_HEADING.length;
  const next = text.slice(bodyStart).search(/^(## |\[Unreleased\]: )/m);
  const bodyEnd = next === -1 ? text.length : bodyStart + next;
  const body =
    text.slice(bodyStart, bodyEnd).trim() || 'Maintenance release, no functional change.';

  const released = `${UNRELEASED_HEADING}\n\n## [${version}] - ${date}\n\n${body}\n\n`;
  const links = [
    `[Unreleased]: ${repoUrl}/compare/v${version}...HEAD`,
    `[${version}]: ${repoUrl}/compare/${previousTag}...v${version}`,
  ].join('\n');
  return (text.slice(0, start) + released + text.slice(bodyEnd)).replace(line, links);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [version, date = new Date().toISOString().slice(0, 10)] = process.argv.slice(2);
  if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) {
    console.error('Usage: node scripts/changelog.js <version> [YYYY-MM-DD]');
    process.exit(1);
  }
  const file = new URL('../CHANGELOG.md', import.meta.url);
  await writeFile(file, releaseChangelog(await readFile(file, 'utf8'), version, date));
}
