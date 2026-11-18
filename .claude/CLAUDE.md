@../AGENTS.md

# Claude Code

The shared instructions above apply to every agent. These lines cover Claude Code's own features.

- Claude Code keeps local state in `.claude/` (`worktrees/`, `agent-memory/`, `settings.local.json`). Git ignores all of it except this file.
- The shell's working directory can return to the repository's primary clone between commands. Prefix every worktree command with `cd <worktree> &&` and read files by absolute path. An agent told to work in a worktree may edit the primary clone too, so check `git -C <primary clone> status --short` while parallel agents run.
- In a shared working tree, each subagent brief names a substitute for `git stash`, `checkout`, `reset` and `clean`, since each of them discards other agents' uncommitted work. A reviewer told to stay read-only may run commands that undo the change under review, so its brief forbids changes to git state, and the session that launched it snapshots the diff before and after.
- Run at least one reviewer on the diff and the acceptance criteria alone. A reviewer briefed with the design's reasoning checks the change against that reasoning and misses faults it shares.
- A fact every contributor needs belongs in `AGENTS.md`, proposed in a pull request. Personal details, such as local ports or accounts, belong in auto memory or in `CLAUDE.local.md`, which git ignores.
