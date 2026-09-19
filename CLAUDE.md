# pokemon-data（Claude Code の入口）

このリポジトリのルールの正本は `AGENTS.md`（Codex と共通）。**ここに本文を書かない。**
このファイルは Claude Code に AGENTS.md を常時ロードさせるためだけにある。

⚠ **このファイルを消さない。** Claude Code は AGENTS.md を直接読めるが（v2.1.277〜）、
アップデート直後の最初のセッション・フック無効・テレメトリ無効などでは読まれない。
import ならどのセッションでも確実に載り、`/context` にも出る。

@AGENTS.md
