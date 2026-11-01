Create a pull request following the project's git discipline and PR standards.

## Sources of Truth
- `CLAUDE.md` — project conventions, branch naming, commit format
- `.github/pull_request_template.md` — PR body structure
- `.github/scripts/pr-title-check.js` — allowed types, title format rules
- `.github/scripts/pr-description-check.js` — required sections validation

## Workflow

### Step 1: Gather branch state

Run these commands and store the results:
```
git status
git branch --show-current                    → $CURRENT_BRANCH
git remote -v                                → confirm remote exists
```

Determine the base branch: use `main` unless the user specifies otherwise. Store as `$BASE`.

```
git log $BASE..HEAD --oneline                → all commits on this branch
git diff $BASE..HEAD --stat                  → summary of changed files
git diff $BASE..HEAD                         → full diff for analysis
gh pr list --head $CURRENT_BRANCH --state open --json url,number,title,body,headRefOid
```

Store any existing PR result as `$EXISTING_PR`.

### Step 2: Handle uncommitted changes

If there are **no uncommitted changes**, skip to Step 3.

If there are uncommitted changes:
- If currently on `main`, create a new branch first following branch naming conventions from `CLAUDE.md`.
- Run `git diff --cached --name-only` to check if files are already staged.
  - If files are already staged, commit only those staged files without adding more.
  - If nothing is staged, run `git add -u` to stage all modified/deleted tracked files.
- Check for **untracked files** with `git status --porcelain`. Warn the user about any sensitive files (`.env`, credentials, binaries, secrets) — do NOT stage those. For other untracked files, ask the user whether to include them.
- Draft and create a commit using format `<type>(<scope>): <description>`.
- Run `npm run build` before committing and fix anything it reports. The repo has no pre-commit hooks or automated tests yet.
- Retry the commit once the build passes (max 2 fix attempts).
- After fixing, summarize what was broken and what was changed to fix it.
- If a fix cannot be found after thorough investigation, stop and report to the user.

### Step 3: Push to remote

No prompting — push directly.

```
git rev-parse --abbrev-ref --symbolic-full-name @{upstream} 2>/dev/null
```

- If **not tracking** a remote: `git push -u origin HEAD`
- If **tracking and local is ahead**: `git push`
- **Never force-push** without explicit user confirmation.

### Step 4: Draft the PR title

Read `.github/scripts/pr-title-check.js` to get the exact allowed types and validation rules. Draft a title in format:

```
<type>(<scope>): <description>
```

- Type: one of `feat`, `fix`, `build`, `chore`, `docs`, `refactor`, `test`, `style`, `perf`, `ci`
- Scope: the product area identified from the diff (e.g. `canvas`, `backend`, `auth`, `layout`)
- Description: concise, lowercase start, min 5 chars

Validate it through stdin with a quoted heredoc, never as a quoted argument, because the shell would run anything in backticks:

```
node .github/scripts/pr-title-check.js <<'EOF'
<title>
EOF
```

The title **must pass** before proceeding.

### Step 5: Draft the PR body

Read `.github/pull_request_template.md` fresh every time. Fill each section:

- **Description**: concise summary of all changes and why. Fill in the Documentation sub-section (Issue/Ticket, Figma, Design Link, Technical Design Doc, Dependencies) — use "N/A" for items that don't apply.
- **In Scope**: bulleted list of changes derived from the diff and commit messages.
- **Not in Scope**: changes that would make sense but are deliberately excluded, and why.
- **Breaking Changes**: list any API contracts, schema changes, or behavior changes that affect others. If none, write "None".
- **Deployment Notes**: list migrations, env vars, feature flags, or infra steps required. If none, write "None".
- **Media**: if visual changes, include screenshots. If not, write "No visual changes in this PR".
- **Tests to Run**: keep the complete list of checks **exactly as they appear in the template**. Do NOT remove, reorder, or abbreviate any entries. Tick only the checks you actually ran.
- **Author Checklist**: keep exactly as in template, all unchecked.
- **Reviewer Checklist**: keep exactly as in template, all unchecked.

Validate it the same way:

```
node .github/scripts/pr-description-check.js <<'EOF'
<body>
EOF
```

### Step 6: Create or update the PR

Do not prompt for confirmation.

**If no existing PR** (`$EXISTING_PR` is empty):

Auto-label based on branch prefix:
- `feat/` → `feature`
- `fix/` → `bug`
- `chore/` or `build/` → `maintenance`
- `docs/` → `documentation`
- `refactor/` → `refactor`
- `test/` → `testing`
- `perf/` → `performance`
- `ci/` → `ci/cd`

If the label doesn't exist in the repo, create it first with `gh label create "<label>" --force` before attaching it. If label creation fails, proceed without the label.

Create with the title and body in quoted heredocs, so nothing in them runs:
```
gh pr create --base $BASE --label "<label>" --title "$(cat <<'EOF'
<title>
EOF
)" --body "$(cat <<'EOF'
...full PR body...
EOF
)"
```

**If a PR already exists** (`$EXISTING_PR` is not empty):

Compare the `headRefOid` field from `$EXISTING_PR` with the current HEAD SHA (`git rev-parse HEAD`).

- If SHAs **match**: PR is already up to date. Print the URL. No-op.
- If SHAs **differ**: read the existing title and body from `$EXISTING_PR`. Regenerate the title and body from the current diff, but treat all existing PR content as reference. Do not overwrite detailed descriptions, documentation links, media, etc. that are still relevant. Update with:

```
gh pr edit <number> --title "$(cat <<'EOF'
<title>
EOF
)" --body "$(cat <<'EOF'
...full PR body...
EOF
)"
```

### Step 7: Return the PR URL

Print the PR URL to the user.
