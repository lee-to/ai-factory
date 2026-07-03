# QA Check: [Test Area]

Source test cases: `[test_cases_path]`
Branch: `[resolved_branch]`
Mode: `[human | agent]`
Tested revision: `[commit SHA | n/a]`
Worktree digest: `[worktree digest | n/a]`
Manual build/version identifier: `[manual_build_id | n/a]`
Source digest: `[test-cases.md digest]`
Last updated: `[YYYY-MM-DD HH:mm]`

---

## Summary

- Total: [N]
- Passed: [N]
- Failed: [N]
- Blocked: [N]
- Pending: [N]

## Execution Results

- [ ] TC-001: [Test Case Name]
  - Case digest: [per-case digest]
  - Priority: [High / Medium / Low]
  - Type: [Positive / Negative / Edge / Regression]
  - Status: Pending
  - Tester: [human | agent]
  - Comment: [User failure reason, redacted if sensitive; agent observation, blocker, or blank]
  - Evidence: [redacted URL, browser observation, screenshot reference, or blank]

## Supporting Automated Checks

Automated checks that support one or more `TC-*` results or provide extra QA confidence. Do not count this section as additional `TC-*` execution results.

- [ ] [Check name]
  - Area: [covered behavior]
  - Command / filter: `[command]`
  - Status: [Pending / Passed / Failed / Blocked]
  - Evidence: [exit code, assertion count, relevant output summary, or blocker]

## Stale / Removed Cases

- [ ] TC-000: [Prior Test Case Name]
  - Previous status: [Passed / Failed / Blocked]
  - Stale reason: [tested revision changed | worktree digest changed | manual build changed | source digest changed | case digest changed | case removed]
  - Previous tested revision: [commit SHA | n/a]
  - Previous worktree digest: [worktree digest | n/a]
  - Previous manual build/version identifier: [manual_build_id | n/a]
  - Previous source digest: [digest]
  - Previous case digest: [digest]
  - Previous comment: [preserved comment]
  - Previous evidence: [redacted evidence]
