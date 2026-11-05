#!/usr/bin/env node
/**
 * Organizer tool: record what every team submitted at the deadline.
 *
 * Run it at Friday 6 Nov 2026 16:00 (Helsinki). It lists the pull requests to
 * this repo with the commit each one points at, marks pull requests opened
 * after the deadline as late, and writes the result to a JSON file. With
 * --fetch it also stores each head commit locally as refs/judging/pr-<n>, so a
 * later force-push can't change what we judge.
 *
 * Usage:
 *   node organizer/snapshot-submissions.mjs [--fetch] [--repo owner/name]
 *        [--deadline 2026-11-06T16:00:00+02:00] [--out submissions.json]
 *
 * Needs the GitHub CLI (`gh`) signed in with read access to the repo.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const DEFAULTS = {
  repo: 'etufillari/northfina-lease-loop',
  deadline: '2026-11-06T16:00:00+02:00',
  out: `submissions-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
  fetch: false,
};

function parseArgs(argv) {
  const options = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--fetch') options.fetch = true;
    else if (arg === '--repo') options.repo = argv[++i];
    else if (arg === '--deadline') options.deadline = argv[++i];
    else if (arg === '--out') options.out = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (Number.isNaN(Date.parse(options.deadline))) {
    throw new Error(`Invalid --deadline: ${options.deadline}`);
  }
  return options;
}

// REST with a jq projection: GraphQL `gh pr list --json commits` hits GitHub's
// node limit, and full REST objects (with PR bodies) are needlessly large.
// Each jq filter prints one JSON value per line.
function ghApi(path, jq) {
  const out = execFileSync('gh', ['api', '--paginate', '--jq', `(${jq}) | tojson`, path], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return out
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line));
}

const PR_FIELDS =
  '.[] | {number, title, url: .html_url, state, merged_at, created_at, ' +
  'opened_by: .user.login, fork_owner: .head.repo.owner.login, ' +
  'branch: .head.ref, head_sha: .head.sha}';

function listPullRequests(repo) {
  return ghApi(`repos/${repo}/pulls?state=all&per_page=100`, PR_FIELDS);
}

function headCommitDate(repo, sha) {
  return ghApi(`repos/${repo}/commits/${sha}`, '.commit.committer.date')[0] ?? null;
}

function commitCount(repo, number) {
  return ghApi(`repos/${repo}/pulls/${number}`, '.commits')[0] ?? null;
}

function toSubmission(repo, pr, deadlineMs) {
  return {
    number: pr.number,
    title: pr.title,
    url: pr.url,
    state: pr.merged_at ? 'merged' : pr.state,
    opened_by: pr.opened_by ?? null,
    fork_owner: pr.fork_owner ?? null,
    branch: pr.branch,
    head_sha: pr.head_sha,
    commit_count: commitCount(repo, pr.number),
    head_commit_date: headCommitDate(repo, pr.head_sha),
    created_at: pr.created_at,
    late: Date.parse(pr.created_at) > deadlineMs,
  };
}

function fetchHead(repo, number) {
  execFileSync(
    'git',
    [
      'fetch',
      '--quiet',
      `https://github.com/${repo}.git`,
      `pull/${number}/head:refs/judging/pr-${number}`,
    ],
    { stdio: 'inherit' }
  );
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const deadlineMs = Date.parse(options.deadline);
  const submissions = listPullRequests(options.repo)
    .map((pr) => toSubmission(options.repo, pr, deadlineMs))
    .sort((a, b) => a.number - b.number);

  if (options.fetch) {
    for (const submission of submissions) fetchHead(options.repo, submission.number);
  }

  const snapshot = {
    repo: options.repo,
    deadline: options.deadline,
    taken_at: new Date().toISOString(),
    submissions,
  };
  writeFileSync(options.out, `${JSON.stringify(snapshot, null, 2)}\n`);

  for (const s of submissions) {
    const flag = s.late ? 'LATE' : 'ok  ';
    console.log(`${flag} #${s.number} ${s.head_sha.slice(0, 7)} ${s.title}`);
  }
  console.log(`\n${submissions.length} pull request(s) written to ${options.out}`);
}

main();
