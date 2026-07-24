---
title: '清理 AI 编程工具的本地对话记录（Claude Code / Codex）'
date: '2026-07-24 16:30'
tags: ['AI', 'CLI']
draft: false
summary: 'Claude Code 和 Codex CLI 会把每次对话完整地明文保存在本地。本文整理它们各自的存储位置，以及如何彻底清除且不留残留，文末附交互式清理脚本。'
---

import CodeBlock from '@theme/CodeBlock';
import cleanScript from '!!raw-loader!../static/files/clean_ai_chats.py';

# 清理 AI 编程工具的本地对话记录（Claude Code / Codex）

Claude Code、Codex 这类终端 AI 编程工具，会把每一次对话原样保存在本地：你输入的提示词、粘贴进去的内容、AI 读到的代码上下文，全部是明文 JSONL。平时不觉得，直到某天想清理隐私、换电脑、或者发现家目录莫名多出几百 MB。以我自己的机器为例：`~/.claude` 占 67MB，`~/.codex` 占了 1GB。

本文主要讲两件事：**数据到底存在哪**，以及**怎么删干净、不留残留**；文末附上一个把这些清理逻辑打包好的交互式脚本作为参考。

{/* truncate */}

:::info
本文基于 2026 年 7 月的 Claude Code 与 Codex CLI（macOS），目录结构和文件名可能随版本调整，动手前先 `ls` 确认一下。
:::

## Claude Code

### 存了什么、在哪

| 路径 | 内容 |
| --- | --- |
| `~/.claude/projects/<项目路径编码>/*.jsonl` | **对话全文**，每个会话一个文件（含子代理会话），`claude --resume` 靠它恢复 |
| `~/.claude/history.jsonl` | 全局输入历史（按上箭头翻的那个），**连粘贴内容 `pastedContents` 一起存** |
| `~/.claude/file-history/` | rewind（回退）功能保存的文件快照 |
| `~/.claude/paste-cache/` | 粘贴的大段内容缓存 |
| `~/.claude/plans/`、`~/.claude/tasks/` | 计划模式的方案、任务列表，都是对话衍生物 |
| `~/.claude/shell-snapshots/` | 每次会话的 shell 环境快照 |
| `~/.claude.json` | 项目级元数据，其中 `lastSessionFirstPrompt` 字段残留着**每个项目最近一次会话的第一条提示词** |

两个容易误伤的地方：

- `~/.claude/projects/**/memory/` 是长期记忆目录，不是对话记录，整目录 `rm -rf ~/.claude/projects` 会把它一起删掉；
- `~/.claude/settings.json`、`~/.claude/plugins/` 是配置和插件，别动。

### 推荐：让它自己清理

在 `~/.claude/settings.json` 顶层加一行，启动时会自动删除过期会话（默认保留 30 天）：

```json
"cleanupPeriodDays": 7
```

### 彻底清除

先退出所有正在运行的 `claude` 进程，然后：

```bash
# 1. 对话正文（保留 memory 记忆目录）
find ~/.claude/projects -name '*.jsonl' -not -path '*/memory/*' -delete

# 2. 输入历史（含粘贴内容）
rm -f ~/.claude/history.jsonl

# 3. 会话衍生物：文件快照、粘贴缓存、计划、任务、shell 快照
rm -rf ~/.claude/file-history ~/.claude/paste-cache \
       ~/.claude/plans ~/.claude/tasks ~/.claude/shell-snapshots

# 4. 抹掉 ~/.claude.json 里残留的"最近会话首条提示词"
python3 - <<'PY'
import json, pathlib
p = pathlib.Path.home() / '.claude.json'
d = json.loads(p.read_text())
for proj in (d.get('projects') or {}).values():
    proj.pop('lastSessionFirstPrompt', None)
    proj.pop('lastSessionId', None)
p.write_text(json.dumps(d, indent=2, ensure_ascii=False))
PY
```

副作用：历史会话无法再 `--resume` / `--continue`，上箭头的输入历史清空。配置、登录、插件、记忆都不受影响。

## Codex CLI

### 存了什么、在哪

| 路径 | 内容 |
| --- | --- |
| `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` | **对话全文**，按日期分目录 |
| `~/.codex/archived_sessions/` | 归档过的会话 |
| `~/.codex/history.jsonl` | 跨会话输入历史 |
| `~/.codex/state_*.sqlite` | 会话索引库，`threads` 表存着每个会话的**标题、第一条用户消息、工作目录、git 仓库地址** |
| `~/.codex/logs_*.sqlite` | 日志库，我这里 400 多 MB，是整个目录的最大头 |
| `~/.codex/memories/`、`memories_*.sqlite` | 从对话中提炼的长期记忆（`raw_memories.md` 等） |
| `~/.codex/shell_snapshots/` | shell 环境快照 |

最容易漏的是 `state_*.sqlite`：只删 `sessions/` 目录的话，每个会话的标题和第一条提示词仍然留在这个索引库里——这就是典型的"残留"。

别误删的：`plugins/` 是插件（我这里 300 多 MB 都是它）、`computer-use/` 里是 Codex Computer Use 的 App 本体、`auth.json` 是登录凭证。

### 彻底清除

先退出所有 `codex` 进程，然后：

```bash
# 1. 对话正文 + 归档 + 输入历史 + shell 快照
rm -rf ~/.codex/sessions ~/.codex/archived_sessions ~/.codex/shell_snapshots
rm -f ~/.codex/history.jsonl

# 2. 清掉索引库里的会话元数据（文件名里的数字随版本变化，先 ls 确认）
sqlite3 ~/.codex/state_5.sqlite \
  "DELETE FROM thread_spawn_edges; DELETE FROM threads; VACUUM;"
# 嫌麻烦也可以整库删掉，下次启动自动重建（会丢失少量本地状态）：
# rm -f ~/.codex/state_*.sqlite*

# 3. 日志库（体积最大，求稳就一并清掉，会自动重建）
rm -f ~/.codex/logs_*.sqlite*

# 4. 可选：连"从对话提炼出的记忆"也不留
# rm -rf ~/.codex/memories && rm -f ~/.codex/memories_*.sqlite*
```

如果不想让它以后继续记录输入历史，在 `~/.codex/config.toml` 里加：

```toml
[history]
persistence = "none"
```

会话文件本身没有关闭开关，只能定期删。Codex 也没有类似 `cleanupPeriodDays` 的自动清理配置，想自动化可以用 cron 定期跑：

```bash
find ~/.codex/sessions -name '*.jsonl' -mtime +30 -delete
```

## 其他 AI CLI 的排查思路

这类工具的数据几乎都躲在家目录的隐藏文件夹里（`~/.gemini`、`~/.cursor` 等），套路是一样的：

```bash
# 找出可疑的大目录
du -sh ~/.[a-z]*/ 2>/dev/null | sort -rh | head
```

进去之后按名字分辨：`sessions`、`history`、`chats`、`logs`、`cache` 一般可以清；`auth`、`config`、`settings`、`plugins`、`extensions` 是凭证、配置和插件，要留。拿不准的先挪走，跑一次工具确认没问题再删。

## 小结

- 对话正文只是明面上的一部分，**输入历史、粘贴缓存、sqlite 索引、文件快照才是容易漏的残留**；
- Claude Code 配好 `cleanupPeriodDays` 就能一劳永逸，Codex 需要自己定期删；
- 删除前退出对应进程，删除后这些会话就无法 resume 了——确认不再需要再动手。

## 参考脚本

上面的命令是"一把梭"式的全量清理。如果想先看看本地到底存了哪些对话、挑着删，可以用下面这个交互式脚本：它会扫描 Claude Code 和 Codex 的全部会话，列出每条的时间、大小、所属项目和第一条用户消息摘要，然后按编号选择删除。默认移入废纸篓（可找回），自动跳过 Claude 的 memory 记忆目录，2 小时内有活动的会话会标注「⚠ 可能在用」。

```bash
python3 clean_ai_chats.py            # 列出全部会话，按编号选择删除（如 1,3,5-8 或 all）
python3 clean_ai_chats.py --days 30  # 只看最后修改在 30 天前的会话
python3 clean_ai_chats.py --list     # 只列出，不删除
python3 clean_ai_chats.py --purge    # 彻底删除，而不是移入废纸篓
```

[下载 clean_ai_chats.py](pathname:///files/clean_ai_chats.py)，或直接展开查看：

<details>
<summary>clean_ai_chats.py 完整源码</summary>

<CodeBlock language="python" title="clean_ai_chats.py" showLineNumbers>{cleanScript}</CodeBlock>

</details>
