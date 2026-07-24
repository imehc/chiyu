#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
clean_ai_chats.py — 查看并清理 Claude Code / Codex 本地会话存档

用法:
  python3 clean_ai_chats.py                 # 列出全部会话，按编号选择删除
  python3 clean_ai_chats.py --days 30       # 只看最后修改在 30 天前的会话
  python3 clean_ai_chats.py --tool codex    # 只处理 codex (可选 claude/codex/all)
  python3 clean_ai_chats.py --list          # 只列出，不进入删除交互
  python3 clean_ai_chats.py --purge         # 彻底删除（默认是移入废纸篓）

说明:
  - Claude Code 会话: ~/.claude/projects/**/*.jsonl（自动跳过 memory/ 记忆目录）
  - Codex 会话:       ~/.codex/sessions 和 ~/.codex/archived_sessions
  - 默认把选中的文件移到 ~/.Trash/ai-chats-<时间戳>/，后悔可以从废纸篓找回
  - 不会碰输入历史、日志、插件、记忆等其他文件
"""

import argparse
import json
import re
import shutil
import sys
import time
import unicodedata
from datetime import datetime
from pathlib import Path

HOME = Path.home()
CLAUDE_PROJECTS = HOME / ".claude" / "projects"
CODEX_ROOTS = [
    (HOME / ".codex" / "sessions", ""),
    (HOME / ".codex" / "archived_sessions", "归档"),
]
TRASH = HOME / ".Trash"
ACTIVE_WINDOW = 2 * 3600  # 2 小时内修改过的标记为“可能在用”


# ---------- 通用工具 ----------

def dwidth(s):
    return sum(2 if unicodedata.east_asian_width(ch) in "WF" else 1 for ch in s)


def truncate(s, width):
    out, cur = "", 0
    for ch in s:
        w = 2 if unicodedata.east_asian_width(ch) in "WF" else 1
        if cur + w > width - 1:
            return out + "…"
        out += ch
        cur += w
    return out


def pad(s, width):
    return s + " " * max(0, width - dwidth(s))


def human(n):
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024 or unit == "GB":
            return ("%d%s" if unit == "B" else "%.1f%s") % (n, unit)
        n /= 1024.0


def short_path(p, width=26):
    if not p:
        return "?"
    p = re.sub("^" + re.escape(str(HOME)), "~", p)
    parts = [x for x in p.split("/") if x]
    while dwidth(p) > width and len(parts) > 2:
        parts = parts[1:]
        p = "…/" + "/".join(parts)
    return truncate(p, width)


def read_jsonl_head(path, max_lines=80, max_bytes=2_000_000, max_line_bytes=1_000_000):
    # 只读文件头部若干字节，并跳过超大行（贴入的大段内容/base64），保证扫描速度
    try:
        with open(path, "rb") as f:
            data = f.read(max_bytes)
    except OSError:
        return []
    lines = data.split(b"\n")
    if len(data) == max_bytes and lines:
        lines = lines[:-1]  # 最后一段可能被截断
    entries = []
    for raw in lines[:max_lines]:
        raw = raw.strip()
        if not raw or len(raw) > max_line_bytes:
            continue
        try:
            entries.append(json.loads(raw.decode("utf-8", "replace")))
        except json.JSONDecodeError:
            pass
    return [e for e in entries if isinstance(e, dict)]


def squeeze(text):
    text = text[:4000]
    text = re.sub(r"<environment_context>.*?</environment_context>", " ", text, flags=re.S | re.I)
    text = re.sub(r"<user_instructions>.*?</user_instructions>", " ", text, flags=re.S | re.I)
    text = re.sub(r"<[^>]{1,60}>", " ", text)
    return " ".join(text.split())


# ---------- 各工具的会话信息提取 ----------

def claude_info(path):
    cwd, summary, first_user, sidechain = None, None, None, False
    for e in read_jsonl_head(path):
        cwd = cwd or e.get("cwd")
        if e.get("isSidechain"):
            sidechain = True
        t = e.get("type")
        if t == "summary" and not summary:
            summary = e.get("summary")
        if t == "user" and not first_user:
            content = (e.get("message") or {}).get("content")
            text = None
            if isinstance(content, str):
                text = content
            elif isinstance(content, list):
                for block in content:
                    if isinstance(block, dict) and block.get("type") == "text":
                        text = block.get("text")
                        break
            if text and not text.startswith("Caveat:"):
                m = re.search(r"<command-name>(.*?)</command-name>", text)
                first_user = m.group(1).strip() if m else squeeze(text)
    return cwd, summary or first_user, sidechain


def codex_info(path):
    cwd, first_user = None, None
    for e in read_jsonl_head(path):
        payload = e.get("payload") if isinstance(e.get("payload"), dict) else {}
        cwd = cwd or payload.get("cwd") or e.get("cwd")
        if first_user:
            continue
        if payload.get("type") == "user_message":
            first_user = squeeze(str(payload.get("message") or "")) or None
        elif payload.get("type") == "message" and payload.get("role") == "user":
            for block in payload.get("content") or []:
                if isinstance(block, dict) and block.get("type") in ("input_text", "text"):
                    t = squeeze(str(block.get("text") or ""))
                    if t:
                        first_user = t
                        break
    return cwd, first_user


# ---------- 收集与展示 ----------

def collect(args):
    chats = []
    cutoff = time.time() - args.days * 86400 if args.days > 0 else None

    def add(tool, path, tags):
        try:
            st = path.stat()
        except OSError:
            return
        if cutoff and st.st_mtime > cutoff:
            return
        if time.time() - st.st_mtime < ACTIVE_WINDOW:
            tags = tags + ["⚠ 可能在用"]
        if tool == "claude":
            cwd, preview, sidechain = claude_info(path)
            if sidechain:
                tags = tags + ["子代理"]
        else:
            cwd, preview = codex_info(path)
        chats.append({
            "tool": tool, "path": path, "mtime": st.st_mtime, "size": st.st_size,
            "project": short_path(cwd or path.parent.name),
            "preview": ("".join("[%s]" % t for t in tags) + " " if tags else "") + (preview or "(无文本内容)"),
        })

    if args.tool in ("claude", "all") and CLAUDE_PROJECTS.is_dir():
        for p in CLAUDE_PROJECTS.rglob("*.jsonl"):
            rel_parts = p.relative_to(CLAUDE_PROJECTS).parts
            if "memory" in rel_parts:
                continue
            add("claude", p, [])
    if args.tool in ("codex", "all"):
        for root, tag in CODEX_ROOTS:
            if root.is_dir():
                for p in root.rglob("*.jsonl"):
                    add("codex", p, [tag] if tag else [])

    chats.sort(key=lambda c: c["mtime"])
    return chats


def render(chats):
    cols = shutil.get_terminal_size((120, 40)).columns
    proj_w = 26
    preview_w = max(24, cols - (5 + 7 + 12 + 8 + proj_w + 5))
    now_year = datetime.now().year
    print(pad("编号", 5) + pad("工具", 7) + pad("最后修改", 12) + pad("大小", 8)
          + pad("项目", proj_w + 1) + "内容摘要")
    print("-" * min(cols, 5 + 7 + 12 + 8 + proj_w + 1 + preview_w))
    for i, c in enumerate(chats, 1):
        dt = datetime.fromtimestamp(c["mtime"])
        when = dt.strftime("%m-%d %H:%M") if dt.year == now_year else dt.strftime("%Y-%m-%d")
        print(pad(str(i), 5) + pad(c["tool"], 7) + pad(when, 12) + pad(human(c["size"]), 8)
              + pad(c["project"], proj_w + 1) + truncate(c["preview"], preview_w))
    total = sum(c["size"] for c in chats)
    print("-" * min(cols, 5 + 7 + 12 + 8 + proj_w + 1 + preview_w))
    print("共 %d 个会话，合计 %s" % (len(chats), human(total)))


def parse_selection(s, n):
    s = s.strip().lower().replace("，", ",")
    if not s:
        return []
    if s == "all":
        return list(range(1, n + 1))
    out = set()
    for part in s.split(","):
        part = part.strip()
        if not part:
            continue
        m = re.fullmatch(r"(\d+)\s*-\s*(\d+)", part)
        if m:
            a, b = int(m.group(1)), int(m.group(2))
            if not (1 <= a <= b <= n):
                raise ValueError(part)
            out.update(range(a, b + 1))
        elif part.isdigit() and 1 <= int(part) <= n:
            out.add(int(part))
        else:
            raise ValueError(part)
    return sorted(out)


# ---------- 删除 ----------

def prune_empty_dirs(root):
    if not root.is_dir():
        return
    subdirs = sorted((p for p in root.rglob("*") if p.is_dir()),
                     key=lambda p: len(p.parts), reverse=True)
    for d in subdirs:
        try:
            d.rmdir()  # 只删得掉空目录，memory/ 等非空目录不受影响
        except OSError:
            pass


def remove(picked, purge):
    ok, failed, freed = 0, 0, 0
    dest_root = None
    if not purge:
        TRASH.mkdir(exist_ok=True)
        dest_root = TRASH / ("ai-chats-" + datetime.now().strftime("%Y%m%d-%H%M%S"))
    for c in picked:
        try:
            if purge:
                c["path"].unlink()
            else:
                parts = list(c["path"].relative_to(HOME).parts)
                parts[0] = parts[0].lstrip(".")
                dest = dest_root.joinpath(*parts)
                dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.move(str(c["path"]), str(dest))
            ok += 1
            freed += c["size"]
        except OSError as e:
            failed += 1
            print("失败: %s (%s)" % (c["path"], e))
    prune_empty_dirs(CLAUDE_PROJECTS)
    for root, _ in CODEX_ROOTS:
        prune_empty_dirs(root)
    action = "彻底删除" if purge else "移入废纸篓"
    print("完成: %d 个会话已%s，释放 %s%s" % (
        ok, action, human(freed),
        "" if purge else "（%s）" % dest_root))
    if failed:
        print("有 %d 个失败，见上方信息。" % failed)


# ---------- 主流程 ----------

def main():
    ap = argparse.ArgumentParser(
        description="查看并清理 Claude Code / Codex 本地会话存档",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="不带参数运行 = 列出全部并交互选择。默认移入废纸篓，可从废纸篓恢复。")
    ap.add_argument("--days", type=int, default=0, metavar="N",
                    help="只处理最后修改在 N 天前的会话（默认 0 = 全部）")
    ap.add_argument("--tool", choices=["claude", "codex", "all"], default="all",
                    help="只处理某个工具的会话（默认 all）")
    ap.add_argument("--list", action="store_true", help="只列出，不进入删除交互")
    ap.add_argument("--purge", action="store_true", help="彻底删除，而不是移入废纸篓")
    args = ap.parse_args()

    chats = collect(args)
    if not chats:
        print("没有找到符合条件的会话。")
        return
    render(chats)

    if args.list or not sys.stdin.isatty():
        print("\n提示: 去掉 --list 重新运行即可选择删除；--days 30 只看 30 天前的旧会话。")
        return

    print()
    try:
        sel = input("输入要删除的编号（如 1,3,5-8 或 all），直接回车退出: ")
    except (EOFError, KeyboardInterrupt):
        print()
        return
    try:
        idxs = parse_selection(sel, len(chats))
    except ValueError as e:
        print("无法识别的编号: %s" % e)
        return
    if not idxs:
        print("未删除任何内容。")
        return

    picked = [chats[i - 1] for i in idxs]
    action = "彻底删除" if args.purge else "移入废纸篓"
    try:
        ans = input("确认将 %d 个会话（%s）%s? [y/N] "
                    % (len(picked), human(sum(c["size"] for c in picked)), action))
    except (EOFError, KeyboardInterrupt):
        print()
        return
    if ans.strip().lower() not in ("y", "yes"):
        print("已取消。")
        return
    remove(picked, args.purge)


if __name__ == "__main__":
    main()
