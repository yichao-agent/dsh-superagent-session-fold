#!/usr/bin/env python3
"""Regenerate assets/star-history.svg from the GitHub API.

The chart plots cumulative stargazers over time (authoritative dates from the
stargazers endpoint) plus the latest watcher (repository subscriber) count.
Standard library only, so the scheduled workflow needs no dependencies.

Usage:
    GITHUB_TOKEN=... GITHUB_REPOSITORY=owner/repo python3 scripts/star_history.py
    python3 scripts/star_history.py --offline

The workflow runs this daily and commits `assets/star-history.svg` and
`data/history.json` when the counts changed.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SVG_PATH = ROOT / "assets" / "star-history.svg"
DATA_PATH = ROOT / "data" / "history.json"
API = "https://api.github.com"
REPO = os.environ.get("GITHUB_REPOSITORY") or "yichao-agent/dsh-session-fold"
TOKEN = os.environ.get("GITHUB_TOKEN")

WIDTH, HEIGHT = 760, 260
LEFT, RIGHT, TOP, BOTTOM = 54, 20, 46, 34
PLOT_W = WIDTH - LEFT - RIGHT
PLOT_H = HEIGHT - TOP - BOTTOM

GRID = "#8B98AC"
MUTED = "#7C8798"
LINE = "#2F6FED"
LINE_2 = "#16A34A"
BG_AREA = "#2F6FED"


def api(path: str, accept: str | None = None) -> object:
    headers = {
        "Accept": accept or "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "dsh-session-fold-star-history",
    }
    if TOKEN:
        headers["Authorization"] = f"Bearer {TOKEN}"
    request = urllib.request.Request(f"{API}{path}", headers=headers)
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


def collect() -> tuple[list[dict], int]:
    """Return cumulative star points and the current watcher count."""
    info = api(f"/repos/{REPO}")
    total = int(info.get("stargazers_count") or 0)
    watchers = int(info.get("subscribers_count") or 0)

    dates: list[date] = []
    page = 1
    while True:
        rows = api(
            f"/repos/{REPO}/stargazers?per_page=100&page={page}",
            accept="application/vnd.github.star+json",
        )
        if not isinstance(rows, list) or not rows:
            break
        for row in rows:
            stamp = row.get("starred_at") if isinstance(row, dict) else None
            if isinstance(stamp, str):
                dates.append(datetime.fromisoformat(stamp.replace("Z", "+00:00")).date())
        if len(rows) < 100:
            break
        page += 1

    by_day: dict[date, int] = {}
    for day in dates:
        by_day[day] = by_day.get(day, 0) + 1
    stars: list[dict] = []
    running = 0
    for day in sorted(by_day):
        running += by_day[day]
        stars.append({"date": day.isoformat(), "count": running})
    if total > running:
        # The endpoint can lag or hide actors; the repo counter is authoritative.
        stars.append({"date": date.today().isoformat(), "count": total})
    if stars:
        stars[-1]["count"] = max(stars[-1]["count"], total)
    return stars, watchers


def load_history() -> dict:
    try:
        return json.loads(DATA_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def merge(stars: list[dict], watchers: int, history: dict) -> dict:
    subscribers = [
        row for row in history.get("subscribers", []) if isinstance(row, dict) and "date" in row
    ]
    today = date.today().isoformat()
    subscribers = [row for row in subscribers if row.get("date") != today]
    subscribers.append({"date": today, "count": watchers})
    subscribers.sort(key=lambda row: row["date"])
    return {"stars": stars, "subscribers": subscribers}


def scale(value: float, start: float, span: float, size: float) -> float:
    return start + (value * size)


def nice_max(value: int) -> int:
    """Four equal y-ticks on integer values; zero still renders an axis."""
    return max(4, ((max(value, 0) + 3) // 4) * 4)


def render(stars: list[dict], subscribers: list[dict], watchers: int) -> str:
    total = stars[-1]["count"] if stars else 0
    points: list[tuple[date, int]] = []
    for row in stars:
        try:
            points.append((date.fromisoformat(row["date"]), int(row["count"])))
        except (KeyError, TypeError, ValueError):
            continue
    today = date.today()
    span_days = 7
    if points:
        first = points[0][0]
        span_days = max(7, (today - first).days)
    start_day = today - timedelta(days=span_days)

    y_max = nice_max(total)
    def x(day: date) -> float:
        offset = (day - start_day).days / span_days
        return LEFT + min(1.0, max(0.0, offset)) * PLOT_W
    def y(count: float) -> float:
        return TOP + PLOT_H - (count / y_max) * PLOT_H

    out: list[str] = []
    out.append(
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{HEIGHT}" '
        f'viewBox="0 0 {WIDTH} {HEIGHT}" role="img" '
        f'aria-label="GitHub star history: {total} stars, {watchers} watchers">'
    )
    out.append(
        "<defs><linearGradient id=\"area\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\">"
        f'<stop offset="0%" stop-color="{BG_AREA}" stop-opacity="0.22"/>'
        f'<stop offset="100%" stop-color="{BG_AREA}" stop-opacity="0"/>'
        "</linearGradient></defs>"
    )
    out.append(
        f'<text x="{LEFT}" y="24" font-size="15" font-weight="600" fill="{MUTED}" '
        'font-family="ui-sans-serif, -apple-system, Segoe UI, sans-serif">GitHub stars</text>'
    )
    out.append(
        f'<text x="{WIDTH - RIGHT}" y="24" text-anchor="end" font-size="12" fill="{MUTED}" '
        f'font-family="ui-sans-serif, -apple-system, Segoe UI, sans-serif">'
        f'{total} stars · {watchers} watchers</text>'
    )

    for tick in range(5):
        value = y_max * tick / 4
        gy = y(value)
        out.append(
            f'<line x1="{LEFT}" y1="{gy:.1f}" x2="{LEFT + PLOT_W}" y2="{gy:.1f}" '
            f'stroke="{GRID}" stroke-opacity="0.25" stroke-width="1"/>'
        )
        out.append(
            f'<text x="{LEFT - 8}" y="{gy + 4:.1f}" text-anchor="end" font-size="10" fill="{MUTED}" '
            f'font-family="ui-sans-serif, -apple-system, Segoe UI, sans-serif">{int(round(value))}</text>'
        )

    for offset, label, anchor in (
        (0, start_day, "start"),
        (span_days // 2, start_day + timedelta(days=span_days // 2), "middle"),
        (span_days, today, "end"),
    ):
        gx = x(label)
        out.append(
            f'<text x="{gx:.1f}" y="{TOP + PLOT_H + 18}" text-anchor="{anchor}" font-size="10" '
            f'fill="{MUTED}" font-family="ui-sans-serif, -apple-system, Segoe UI, sans-serif">'
            f'{label.isoformat()}</text>'
        )

    if points:
        coords = [(x(day), y(count)) for day, count in points]
        if coords[-1][0] < LEFT + PLOT_W:
            coords.append((LEFT + PLOT_W, coords[-1][1]))
        line = " ".join(f"{px:.1f},{py:.1f}" for px, py in coords)
        area = f"{LEFT},{TOP + PLOT_H} {line} {LEFT + PLOT_W},{TOP + PLOT_H}"
        out.append(f'<polygon points="{area}" fill="url(#area)"/>')
        out.append(
            f'<polyline points="{line}" fill="none" stroke="{LINE}" stroke-width="2.2" '
            'stroke-linejoin="round" stroke-linecap="round"/>'
        )
    else:
        out.append(
            f'<line x1="{LEFT}" y1="{TOP + PLOT_H}" x2="{LEFT + PLOT_W}" y2="{TOP + PLOT_H}" '
            f'stroke="{LINE}" stroke-width="2" stroke-opacity="0.35"/>'
        )

    if not points:
        out.append(
            f'<text x="{LEFT + PLOT_W / 2:.1f}" y="{TOP + PLOT_H / 2:.1f}" text-anchor="middle" '
            f'font-size="12" fill="{MUTED}" font-family="ui-sans-serif, -apple-system, Segoe UI, sans-serif">'
            "No stars yet — the chart updates daily</text>"
        )

    out.append("</svg>")
    return "\n".join(out) + "\n"


def main() -> int:
    offline = "--offline" in sys.argv
    history = load_history()
    if offline:
        stars = history.get("stars", [])
        subscribers = history.get("subscribers", [])
        watchers = subscribers[-1].get("count", 0) if subscribers else 0
    else:
        try:
            stars, watchers = collect()
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, ValueError) as error:
            print(f"star-history: GitHub API failed: {error}", file=sys.stderr)
            return 1
        history = merge(stars, watchers, history)
        subscribers = history["subscribers"]

    SVG_PATH.parent.mkdir(parents=True, exist_ok=True)
    DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
    SVG_PATH.write_text(render(stars, subscribers, watchers), encoding="utf-8")
    if not offline:
        DATA_PATH.write_text(json.dumps(history, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"star-history: {stars[-1]['count'] if stars else 0} stars, {watchers} watchers")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
