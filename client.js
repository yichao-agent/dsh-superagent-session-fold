/**
 * dsh-superagent-session-fold — client half.
 *
 * Replaces the sidebar browsing region (`sidebar.workspaces`) with a compact
 * session browser that folds every Workspace under a configured directory
 * (default: the superagent state directory) into one collapsible group.
 *
 * Why a replacement instead of a data transform: the shipped browser receives
 * Workspace membership from a single root hook and a Workspace registration
 * cannot carry sessions whose stored cwd differs, so the only way to collapse
 * many worker directories into one sidebar entry is to render the region
 * ourselves. The shipped browser stays installed and returns when this bundle
 * is disabled; this registration simply shadows it at a lower priority.
 *
 * Data comes from the standard root hooks (`useSessions`, `useWorkspaces`,
 * `useSessionStatus`), so no Harness Client package is imported. Actions go
 * through the public Client services (`uiWorkspace`, `workspaces`).
 */

window.__ModuleLoader__.load({
  id: 'dsh-superagent-session-fold',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useMemo, useRef, useCallback } = React

    const NS = 'sessionFold'
    const STORE_ROOTS = 'dsh-superagent-session-fold.roots.v1'
    const STORE_SHOW_ARCHIVED = 'dsh-superagent-session-fold.showArchived.v1'
    const STORE_EXPANDED = 'dsh-superagent-session-fold.expanded.v1'
    // Keys written by the pre-rename bundle; read once and re-persisted under
    // the new names so existing users keep their view state.
    const LEGACY_ROOTS = 'dsh-session-fold.roots.v1'
    const LEGACY_SHOW_ARCHIVED = 'dsh-session-fold.showArchived.v1'
    const LEGACY_EXPANDED = 'dsh-session-fold.expanded.v2'
    const DEFAULT_ROOTS = ['/.dsh/state/superagent']
    const FOLD_KEY = '__session-fold__'
    const UNGROUPED_KEY = '__session-fold-ungrouped__'

    /** Simplified Chinese dictionary. */
    const zh = {
      'section.title': '会话',
      'search.placeholder': '搜索会话…',
      'search.aria': '搜索会话',
      'search.close': '关闭搜索',
      'actions.more': '视图选项',
      'group.folded': 'Superagent 任务',
      'group.ungrouped': '未分组',
      'session.blank': '新会话',
      'session.untitled': '未命名',
      'status.running': '运行中',
      'status.approval': '等待审批',
      'status.planReview': '等待确认计划',
      'status.question': '等待回答',
      'status.completed': '已完成',
      'menu.expandAll': '全部展开',
      'menu.collapseAll': '全部折叠',
      'menu.showArchived': '显示已归档',
      'menu.hideArchived': '隐藏已归档',
      'action.archive': '归档',
      'action.unarchive': '取消归档',
      'action.pin': '固定',
      'action.unpin': '取消固定',
      'toast.archived': '已归档的会话不可打开',
      'toast.archiveFailed': '归档失败：{message}',
      'empty.none': '暂无会话',
      'empty.noMatches': '无匹配结果',
      'time.justNow': '刚刚',
      'time.minutes': '{n} 分钟前',
      'time.hours': '{n} 小时前',
      'time.days': '{n} 天前',
      'superagent.running': '运行中 {n}',
      'superagent.pending': '待处理 {n}',
      'superagent.tasks': '{n} 个任务',
      'superagent.open': '打开 Superagent 主会话',
      'fallback': '会话折叠加载失败，已保留经典视图的入口；刷新页面可重试。',
    }

    /** English dictionary. */
    const en = {
      'section.title': 'Sessions',
      'search.placeholder': 'Search sessions…',
      'search.aria': 'Search sessions',
      'search.close': 'Close search',
      'actions.more': 'View options',
      'group.folded': 'Superagent tasks',
      'group.ungrouped': 'Ungrouped',
      'session.blank': 'New session',
      'session.untitled': 'Untitled',
      'status.running': 'Running',
      'status.approval': 'Waiting approval',
      'status.planReview': 'Plan review',
      'status.question': 'Waiting answer',
      'status.completed': 'Done',
      'menu.expandAll': 'Expand all',
      'menu.collapseAll': 'Collapse all',
      'menu.showArchived': 'Show archived',
      'menu.hideArchived': 'Hide archived',
      'action.archive': 'Archive',
      'action.unarchive': 'Unarchive',
      'action.pin': 'Pin',
      'action.unpin': 'Unpin',
      'toast.archived': 'Archived sessions cannot be opened',
      'toast.archiveFailed': 'Archive failed: {message}',
      'empty.none': 'No sessions yet',
      'empty.noMatches': 'No matches',
      'time.justNow': 'just now',
      'time.minutes': '{n} min ago',
      'time.hours': '{n} h ago',
      'time.days': '{n} d ago',
      'superagent.running': '{n} running',
      'superagent.pending': '{n} waiting',
      'superagent.tasks': '{n} tasks',
      'superagent.open': 'Open the Superagent main session',
      'fallback': 'Session fold failed to load. Refresh the page to retry.',
    }

    const CSS = `
.sf-root {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  max-height: 100cqh;
  color: var(--dsw-alias-label-primary);
  font-size: 14px;
}
.sf-header {
  flex: none;
  display: flex;
  align-items: center;
  gap: 4px;
  height: 36px;
  padding-left: var(--dsh-sidebar-row-padding, 8px);
  padding-right: 2px;
  box-sizing: border-box;
  color: var(--dsw-alias-label-tertiary);
}
.sf-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  line-height: 20px;
  letter-spacing: .02em;
}
.sf-icon-button {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
}
.sf-icon-button:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.12)); }
.sf-icon-button:focus-visible {
  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-brand-primary));
  outline-offset: -2px;
}
.sf-search {
  flex: none;
  padding: 0 var(--dsh-sidebar-row-padding, 8px) 6px;
}
.sf-search input {
  width: 100%;
  box-sizing: border-box;
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--dsw-alias-border-l1, rgba(127,127,127,.3));
  border-radius: 7px;
  background: var(--dsw-alias-bg-layer-1, transparent);
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  outline: none;
}
.sf-search input:focus { border-color: var(--dsw-alias-brand-primary); }
.sf-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding-bottom: 8px;
  scrollbar-width: thin;
}
.sf-group-row, .sf-row {
  display: flex;
  align-items: center;
  box-sizing: border-box;
  border-radius: 8px;
  padding-inline-start: calc(var(--dsh-sidebar-row-padding, 8px) - 8px + 8px);
  cursor: pointer;
  -webkit-user-select: none;
  user-select: none;
}
.sf-group-row { height: 32px; padding-right: 6px; gap: 6px; }
.sf-row { height: 32px; padding-right: 6px; }
.sf-group-row:hover, .sf-row:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.12)); }
.sf-row.selected { background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.16)); }
.sf-row.archived .sf-row-title { color: var(--dsw-alias-label-secondary, #888); }
.sf-chevron { flex: none; display: inline-flex; color: var(--dsw-alias-label-tertiary); transition: transform .15s ease; }
.sf-chevron.open { transform: rotate(90deg); }
.sf-slot { flex: none; width: 16px; display: inline-flex; align-items: center; justify-content: center; }
.sf-group-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  line-height: 20px;
  color: var(--dsw-alias-label-secondary);
}
.sf-group-count {
  flex: none;
  font-size: 11px;
  line-height: 16px;
  color: var(--dsw-alias-label-tertiary);
  font-variant-numeric: tabular-nums;
}
.sf-row-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin: 0 6px;
  font-size: 13.5px;
  line-height: 20px;
}
.sf-row-meta {
  flex: none;
  font-size: 10.5px;
  line-height: 16px;
  color: var(--dsw-alias-label-tertiary);
  font-variant-numeric: tabular-nums;
}
.sf-row-actions { flex: none; display: none; align-items: center; margin-left: 2px; }
.sf-row:hover .sf-row-actions, .sf-row:focus-within .sf-row-actions { display: inline-flex; }
.sf-row:hover .sf-row-meta, .sf-row:focus-within .sf-row-meta { display: none; }
.sf-action-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
}
.sf-action-button:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.2)); color: var(--dsw-alias-label-primary); }
.sf-dot { flex: none; width: 7px; height: 7px; border-radius: 50%; }
.sf-dot.idle { background: var(--dsw-alias-state-idle-primary, #9aa0a6); }
.sf-dot.running { background: var(--dsw-alias-state-success-primary, #2f9e44); animation: sf-pulse 1.6s ease-in-out infinite; }
.sf-dot.warn { background: var(--dsw-alias-state-warn-primary, #e8a33d); }
.sf-dot.done { background: var(--dsw-alias-state-success-primary, #2f9e44); }
@keyframes sf-pulse { 0%,100% { opacity: 1 } 50% { opacity: .35 } }
.sf-pin { flex: none; display: inline-flex; color: var(--dsw-alias-label-tertiary); margin-left: 2px; }
.sf-subtitle {
  flex: none;
  max-width: 42%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary);
}
.sf-superagent {
  display: flex;
  align-items: center;
  gap: 2px;
  height: 34px;
  padding-right: 6px;
  border-radius: 8px;
  cursor: pointer;
  -webkit-user-select: none;
  user-select: none;
}
.sf-superagent:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.12)); }
.sf-superagent.folded-open { background: transparent; }
.sf-superagent .sf-group-label { font-weight: 500; }
.sf-superagent-open {
  flex: none;
  display: inline-flex;
  margin-left: 4px;
  color: var(--dsw-alias-label-tertiary);
  opacity: 0;
}
.sf-superagent:hover .sf-superagent-open, .sf-superagent:focus-visible .sf-superagent-open { opacity: 1; }
.sf-superagent-meta {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 10.5px;
  line-height: 16px;
  color: var(--dsw-alias-label-tertiary);
  font-variant-numeric: tabular-nums;
}
.sf-superagent-meta .sf-meta-part { display: inline-flex; align-items: center; gap: 4px; }
.sf-superagent-meta .sf-meta-part.running { color: var(--dsw-alias-state-success-primary, #2f9e44); }
.sf-superagent-meta .sf-meta-part.warn { color: var(--dsw-alias-state-warn-primary, #e8a33d); }
.sf-empty {
  padding: 28px 12px;
  text-align: center;
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary);
}
.sf-menu {
  position: absolute;
  z-index: 40;
  top: 34px;
  right: 4px;
  min-width: 168px;
  padding: 4px;
  border: 1px solid var(--dsw-alias-border-l1, rgba(127,127,127,.25));
  border-radius: 9px;
  background: var(--dsw-alias-bg-overlay, var(--dsw-alias-bg-layer-1, #fff));
  box-shadow: 0 8px 24px rgba(0,0,0,.18);
  display: flex;
  flex-direction: column;
}
.sf-menu button {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 30px;
  padding: 0 8px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}
.sf-menu button:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.14)); }
.sf-notice {
  flex: none;
  margin: 0 var(--dsh-sidebar-row-padding, 8px) 6px;
  padding: 6px 8px;
  border-radius: 6px;
  background: var(--dsw-alias-state-error-primary, #b42318);
  color: #fff;
  font-size: 11.5px;
  line-height: 15px;
}
`

    // ---------------------------------------------------------------- icons

    function IconChevron() {
      return h('svg', { width: 12, height: 12, viewBox: '0 0 12 12', 'aria-hidden': true },
        h('path', { d: 'M4.2 2.4 8 6l-3.8 3.6', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }))
    }

    function IconFolder({ open }) {
      return h('svg', { width: 16, height: 16, viewBox: '0 0 16 16', 'aria-hidden': true },
        open
          ? h('path', { d: 'M1.8 4.2c0-.7.6-1.2 1.2-1.2h2.6l1.2 1.4h5.2c.7 0 1.2.6 1.2 1.2v1H1.8v-2.4Zm0 3.4h12.4l-1.2 4.9c-.1.5-.6.9-1.1.9H3.5c-.5 0-1-.4-1.1-.9L1.8 7.6Z', fill: 'currentColor' })
          : h('path', { d: 'M1.8 4.2c0-.7.6-1.2 1.2-1.2h2.6l1.2 1.4h5.2c.7 0 1.2.6 1.2 1.2v5.9c0 .7-.6 1.2-1.2 1.2H3c-.7 0-1.2-.6-1.2-1.2V4.2Z', fill: 'none', stroke: 'currentColor', strokeWidth: 1.2 }))
    }

    function IconSearch() {
      return h('svg', { width: 16, height: 16, viewBox: '0 0 16 16', 'aria-hidden': true },
        h('circle', { cx: 7, cy: 7, r: 4.2, fill: 'none', stroke: 'currentColor', strokeWidth: 1.4 }),
        h('path', { d: 'm10.2 10.2 3 3', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' }))
    }

    function IconMore() {
      return h('svg', { width: 16, height: 16, viewBox: '0 0 16 16', 'aria-hidden': true },
        h('circle', { cx: 3.2, cy: 8, r: 1.25, fill: 'currentColor' }),
        h('circle', { cx: 8, cy: 8, r: 1.25, fill: 'currentColor' }),
        h('circle', { cx: 12.8, cy: 8, r: 1.25, fill: 'currentColor' }))
    }

    function IconArchive() {
      return h('svg', { width: 14, height: 14, viewBox: '0 0 16 16', 'aria-hidden': true },
        h('path', { d: 'M2 3.2h12v2.2H2zM3 6h10v6.2c0 .6-.5 1.1-1.1 1.1H4.1c-.6 0-1.1-.5-1.1-1.1V6Zm3 2.1h4', fill: 'none', stroke: 'currentColor', strokeWidth: 1.2, strokeLinejoin: 'round' }))
    }

    function IconUnarchive() {
      return h('svg', { width: 14, height: 14, viewBox: '0 0 16 16', 'aria-hidden': true },
        h('path', { d: 'M2 3.2h12v2.2H2zM3 6h10v6.2c0 .6-.5 1.1-1.1 1.1H4.1c-.6 0-1.1-.5-1.1-1.1V6Zm5-1.2v3.4m0 0L6.4 6.6M8 8.2l1.6-1.6', fill: 'none', stroke: 'currentColor', strokeWidth: 1.2, strokeLinecap: 'round', strokeLinejoin: 'round' }))
    }

    function IconPin() {
      return h('svg', { width: 12, height: 12, viewBox: '0 0 12 12', 'aria-hidden': true },
        h('path', { d: 'M4.4 1.6h3.2l-.5 2.7 1.3 1.3H3.6l1.3-1.3-.5-2.7ZM5.2 5.8v4.6', fill: 'none', stroke: 'currentColor', strokeWidth: 1.1, strokeLinecap: 'round', strokeLinejoin: 'round' }))
    }

    function IconStack() {
      return h('svg', { width: 16, height: 16, viewBox: '0 0 16 16', 'aria-hidden': true },
        h('rect', { x: 2.6, y: 2.6, width: 10.8, height: 3.1, rx: 1, fill: 'currentColor', opacity: 0.9 }),
        h('rect', { x: 2.6, y: 6.9, width: 10.8, height: 3.1, rx: 1, fill: 'currentColor', opacity: 0.55 }),
        h('rect', { x: 2.6, y: 11.2, width: 10.8, height: 2.2, rx: 1, fill: 'currentColor', opacity: 0.3 }))
    }

    // ------------------------------------------------------------- storage

    function readJson(key, fallback) {
      try {
        const raw = window.localStorage.getItem(key)
        if (raw === null) return fallback
        return JSON.parse(raw)
      } catch {
        return fallback
      }
    }

    function writeJson(key, value) {
      try { window.localStorage.setItem(key, JSON.stringify(value)) } catch { /* storage unavailable */ }
    }

    function normalizeRoot(value) {
      return String(value).replace(/\\/g, '/').replace(/\/+$/, '')
    }

    /** Configured fold roots; `localStorage` overrides the built-in default. */
    function foldRoots() {
      const stored = readJson(STORE_ROOTS, null) ?? readJson(LEGACY_ROOTS, null)
      const list = Array.isArray(stored) && stored.length > 0 ? stored : DEFAULT_ROOTS
      return list.map(normalizeRoot).filter(root => root.length > 1)
    }

    function isFolded(path, roots) {
      if (typeof path !== 'string' || path === '') return false
      const normalized = normalizeRoot(path)
      return roots.some(root => {
        const index = normalized.indexOf(root)
        if (index < 0) return false
        const after = normalized[index + root.length]
        return after === undefined || after === '/'
      })
    }

    /** A folded root itself (the group users know as "superagent"), not a task below it. */
    function isParentPath(path, roots) {
      if (typeof path !== 'string' || path === '') return false
      const normalized = normalizeRoot(path)
      return roots.some(root => normalized === root || normalized.endsWith(root))
    }

    // ------------------------------------------------------------- helpers

    function timeLabel(updatedAt, now, t) {
      const diff = Math.max(0, now - updatedAt)
      const minute = 60_000
      if (diff < minute) return t('time.justNow')
      if (diff < 60 * minute) return t('time.minutes', { n: Math.floor(diff / minute) })
      if (diff < 24 * 60 * minute) return t('time.hours', { n: Math.floor(diff / (60 * minute)) })
      if (diff < 7 * 24 * 60 * minute) return t('time.days', { n: Math.floor(diff / (24 * 60 * minute)) })
      const date = new Date(updatedAt)
      return `${date.getMonth() + 1}/${date.getDate()}`
    }

    function statusOf(status, summary) {
      if (status?.pendingInteraction !== undefined) return 'warn'
      if (status?.running === true || summary?.running === true) return 'running'
      if (status?.completionUnread === true) return 'done'
      return 'idle'
    }

    function statusText(status, summary, t) {
      const kind = statusOf(status, summary)
      switch (kind) {
        case 'warn':
          switch (status?.pendingInteraction) {
            case 'approval': return t('status.approval')
            case 'plan-review': return t('status.planReview')
            case 'question': return t('status.question')
            default: return t('status.approval')
          }
        case 'running': return t('status.running')
        case 'done': return t('status.completed')
        default: return undefined
      }
    }

    function sessionVisible(summary, current, archived, showArchived) {
      if (summary.origin === 'subagent') return false
      if (summary.blank && summary.id !== current) return false
      if (archived.has(summary.id) && !showArchived) return false
      return true
    }

    function groupUpdatedAt(group, byId) {
      const own = group.sessions.reduce((max, id) => Math.max(max, byId[id]?.updatedAt ?? 0), 0)
      return group.children.reduce((max, child) => Math.max(max, groupUpdatedAt(child, byId)), own)
    }

    function groupSessionCount(group) {
      return group.sessions.length + group.children.reduce((sum, child) => sum + groupSessionCount(child), 0)
    }

    function orderSessions(ids, list, pinned) {
      const rank = id => (pinned.has(id) ? 1 : 0)
      return [...ids].sort((a, b) => {
        const pin = rank(b) - rank(a)
        if (pin !== 0) return pin
        const ua = list.byId[a]?.updatedAt ?? 0
        const ub = list.byId[b]?.updatedAt ?? 0
        return ub - ua
      })
    }

    // ------------------------------------------------------------ component

    /**
     * Catches render failures so a defect blanks this region only, with a
     * readable notice, instead of taking the whole sidebar down.
     */
    class FoldBoundary extends React.Component {
      constructor(props) {
        super(props)
        this.state = { failed: false }
      }
      static getDerivedStateFromError() { return { failed: true } }
      componentDidCatch(error) { console.error('dsh-superagent-session-fold: render failed', error) }
      render() {
        if (!this.state.failed) return this.props.children
        return h('div', { className: 'sf-root' },
          h('style', null, CSS),
          h('div', { className: 'sf-empty' }, this.props.label))
      }
    }

    /** Keep the hooks off the guard path: absent standard hooks skip the browser. */
    function FoldRoot(props) {
      const label = typeof props.t === 'function' ? props.t('fallback') : 'Session fold failed to load.'
      if (typeof props.useSessions !== 'function' || typeof props.useWorkspaces !== 'function') {
        return h('div', { className: 'sf-root' }, h('div', { className: 'sf-empty' }, label))
      }
      return h(FoldBoundary, { label }, h(FoldBrowser, props))
    }

    function FoldBrowser(props) {
      const { wide, expandSidebar, t, useSessions, useWorkspaces, useSessionStatus, useSectionScroller } = props
      const list = useSessions(snapshot => snapshot)
      const workspaceState = useWorkspaces(snapshot => snapshot)
      const statuses = useSessionStatus(snapshot => snapshot)
      const useScroller = useSectionScroller

      const [roots] = useState(foldRoots)
      const [expanded, setExpanded] = useState(() => readJson(STORE_EXPANDED, null) ?? readJson(LEGACY_EXPANDED, {}))
      const [showArchived, setShowArchived] = useState(() => (readJson(STORE_SHOW_ARCHIVED, null) ?? readJson(LEGACY_SHOW_ARCHIVED, false)) === true)
      const [query, setQuery] = useState('')
      const [searchOpen, setSearchOpen] = useState(false)
      const [menuOpen, setMenuOpen] = useState(false)
      const [notice, setNotice] = useState('')
      const menuRef = useRef(null)
      const moreRef = useRef(null)
      const inputRef = useRef(null)
      const noticeTimer = useRef(0)

      const scroller = useScroller ? useScroller() : undefined

      const web = props.ctx
      const uiWorkspace = web?.get?.('uiWorkspace')
      const workspaceService = web?.get?.('workspaces')
      const layoutService = web?.get?.('layout')

      const archived = useMemo(() => new Set(workspaceState.archivedSessionIds ?? []), [workspaceState.archivedSessionIds])
      const pinned = useMemo(() => new Set(workspaceState.pinnedSessionIds ?? []), [workspaceState.pinnedSessionIds])
      const current = useMemo(() => {
        const found = Object.values(list.byId).find(summary => (summary.retainedBy?.mainView ?? 0) > 0)
        return found?.id
      }, [list.byId])
      const now = Date.now()

      const flash = useCallback((message) => {
        setNotice(message)
        window.clearTimeout(noticeTimer.current)
        noticeTimer.current = window.setTimeout(() => setNotice(''), 4000)
      }, [])

      useEffect(() => () => window.clearTimeout(noticeTimer.current), [])

      useEffect(() => {
        if (!expanded || Object.keys(expanded).length >= 0) writeJson(STORE_EXPANDED, expanded)
      }, [expanded])

      useEffect(() => { writeJson(STORE_SHOW_ARCHIVED, showArchived) }, [showArchived])

      useEffect(() => {
        if (!searchOpen) return
        const focus = window.setTimeout(() => inputRef.current?.focus(), 20)
        return () => window.clearTimeout(focus)
      }, [searchOpen])

      useEffect(() => {
        if (!menuOpen) return
        const onPointerDown = event => {
          if (menuRef.current?.contains(event.target)) return
          if (moreRef.current?.contains(event.target)) return
          setMenuOpen(false)
        }
        window.addEventListener('pointerdown', onPointerDown, true)
        return () => window.removeEventListener('pointerdown', onPointerDown, true)
      }, [menuOpen])

      // -------------------------------------------------------- derivation

      const groups = useMemo(() => {
        const allIds = list.ids ?? []
        const accounted = new Set()
        const items = workspaceState.items ?? []
        const normal = new Map()
        const foldedChildren = []
        const foldedOwn = []
        const parentSessionIds = []
        let foldedLabel = t('group.folded')
        for (const [index, workspace] of items.entries()) {
          const members = []
          for (const id of workspace.sessionIds ?? []) {
            const summary = list.byId[id]
            if (summary === undefined) continue
            accounted.add(id)
            if (!sessionVisible(summary, current, archived, showArchived)) continue
            members.push(id)
          }
          if (isFolded(workspace.path, roots)) {
            if (isParentPath(workspace.path, roots)) {
              if (workspace.title) foldedLabel = workspace.title
              foldedOwn.push(...members)
            } else if (members.length > 0) {
              foldedChildren.push({
                key: workspace.workspaceId,
                label: workspace.title || workspace.path,
                path: workspace.path,
                workspaceId: workspace.workspaceId,
                folded: false,
                sessions: orderSessions(members, list, pinned),
                children: [],
              })
            }
            continue
          }
          if (members.length === 0) continue
          normal.set(index, {
            key: workspace.workspaceId,
            label: workspace.title || workspace.path,
            path: workspace.path,
            workspaceId: workspace.workspaceId,
            folded: false,
            sessions: orderSessions(members, list, pinned),
            children: [],
          })
        }

        foldedChildren.sort((a, b) => groupUpdatedAt(b, list.byId) - groupUpdatedAt(a, list.byId))
        // The superagent master Session keeps the "orchestrator-" id prefix;
        // the newest one is the live main conversation.
        let masterId
        let masterAt = -1
        for (const id of parentSessionIds) {
          if (!String(id).startsWith('orchestrator-')) continue
          const at = list.byId[id]?.updatedAt ?? 0
          if (at > masterAt) { masterAt = at; masterId = id }
        }
        const foldedIds = [...foldedOwn, ...foldedChildren.flatMap(child => child.sessions)]
        let running = 0
        let pending = 0
        for (const id of foldedIds) {
          const status = statuses?.get?.(id)
          if (status?.pendingInteraction !== undefined) pending += 1
          else if (status?.running === true || list.byId[id]?.running === true) running += 1
        }
        const folded = {
          key: FOLD_KEY,
          label: foldedLabel,
          path: '',
          workspaceId: undefined,
          folded: true,
          sessions: orderSessions(foldedOwn, list, pinned),
          children: foldedChildren,
          masterId,
          counts: { running, pending, tasks: foldedChildren.length, sessions: foldedIds.length },
        }
        const hasFolded = foldedOwn.length > 0 || foldedChildren.length > 0

        // Attention first: running or waiting tasks surface the entry at the
        // top; a quiet containment stays where its parent Workspace sits.
        const parentIndex = items.findIndex(workspace => isParentPath(workspace.path, roots))
        let slotIndex = running + pending > 0
          ? 0
          : parentIndex >= 0
            ? parentIndex
            : items.findIndex(workspace => isFolded(workspace.path, roots))
        if (slotIndex < 0) slotIndex = 0

        const order = []
        for (let index = 0; index < items.length; index += 1) {
          if (index === slotIndex && hasFolded) order.push(folded)
          const group = normal.get(index)
          if (group !== undefined) order.push(group)
        }
        if (hasFolded && !order.includes(folded)) order.unshift(folded)
        if (hasFolded && !order.includes(folded)) order.push(folded)

        const ungrouped = allIds.filter(id => {
          if (accounted.has(id)) return false
          const summary = list.byId[id]
          return summary !== undefined && sessionVisible(summary, current, archived, showArchived)
        })
        if (ungrouped.length > 0) {
          order.push({
            key: UNGROUPED_KEY,
            label: t('group.ungrouped'),
            path: '',
            workspaceId: undefined,
            folded: false,
            sessions: orderSessions(ungrouped, list, pinned),
            children: [],
          })
        }
        return order
      }, [list, workspaceState.items, archived, pinned, current, showArchived, roots, t, statuses])

      const childKeys = useMemo(() => {
        const set = new Set()
        const walk = group => {
          for (const child of group.children) { set.add(child.key); walk(child) }
        }
        for (const group of groups) walk(group)
        return set
      }, [groups])

      const groupPaths = useMemo(() => {
        const map = new Map()
        const walk = (group, trail) => {
          const next = [...trail, group.key]
          map.set(group.key, next)
          for (const id of group.sessions) map.set(`session:${id}`, next)
          for (const child of group.children) walk(child, next)
        }
        for (const group of groups) walk(group, [])
        return map
      }, [groups])

      const defaultExpanded = useCallback(key => key !== FOLD_KEY && !childKeys.has(key), [childKeys])

      const isExpanded = useCallback(key => {
        const value = expanded[key]
        return value === undefined ? defaultExpanded(key) : value === true
      }, [expanded, defaultExpanded])

      const toggleGroup = useCallback(key => {
        setExpanded(currentMap => ({ ...currentMap, [key]: !(currentMap[key] ?? defaultExpanded(key)) }))
      }, [defaultExpanded])

      // Reveal the current session's ancestors once it becomes known, but never
      // auto-open the containment: a worker Session opened from the Superagent
      // panel must not pour its 80 sibling task directories back into the sidebar.
      useEffect(() => {
        if (current === undefined) return
        const trail = groupPaths.get(`session:${current}`)
        if (trail === undefined) return
        const missing = trail.filter(key => key !== FOLD_KEY && !isExpanded(key))
        if (missing.length === 0) return
        setExpanded(map => {
          const next = { ...map }
          for (const key of missing) next[key] = true
          return next
        })
      }, [current, groupPaths, isExpanded])

      const normalizedQuery = query.trim().toLowerCase()
      const searchResults = useMemo(() => {
        if (normalizedQuery === '') return undefined
        const rows = []
        const walk = (group, subtitle) => {
          for (const id of group.sessions) {
            const summary = list.byId[id]
            if (summary === undefined) continue
            const title = summary.blank ? '' : (summary.displayTitle || '')
            const haystack = `${title} ${group.label} ${group.path} ${subtitle ?? ''}`.toLowerCase()
            if (!haystack.includes(normalizedQuery)) continue
            rows.push({ id, group, subtitle })
          }
          for (const child of group.children) walk(child, child.label)
        }
        for (const group of groups) walk(group, undefined)
        rows.sort((a, b) => (list.byId[b.id]?.updatedAt ?? 0) - (list.byId[a.id]?.updatedAt ?? 0))
        return rows
      }, [normalizedQuery, groups, list])

      // ----------------------------------------------------------- actions

      const foldedGroup = useMemo(() => groups.find(group => group.folded), [groups])

      const openManagementPanel = useCallback(() => {
        try {
          if (typeof layoutService?.selectPanel === 'function') {
            layoutService.selectPanel('dsh-superagent')
            return true
          }
        } catch {
          // The panel can be absent when superagent is disabled.
        }
        return false
      }, [layoutService])

      // Clicking the containment opens the main conversation, not the panel:
      // the panel already has its own sidebar entry in the upper navigation.
      const openSuperagent = useCallback(() => {
        const direct = foldedGroup?.masterId
        if (direct !== undefined && uiWorkspace?.openSession) {
          uiWorkspace.openSession(direct)
          return
        }
        const fallback = foldedGroup?.sessions?.[0]
        if (fallback !== undefined && uiWorkspace?.openSession) {
          uiWorkspace.openSession(fallback)
          return
        }
        // Last resorts: ask the orchestrator for its current master, then the panel.
        void (async () => {
          try {
            const response = await fetch('/orchestrator/api/state', {
              headers: { 'x-orchestrator-request': '1' },
            })
            if (response.ok) {
              const data = await response.json()
              if (typeof data?.masterId === 'string' && uiWorkspace?.openSession) {
                uiWorkspace.openSession(data.masterId)
                return
              }
            }
          } catch {
            // Ignore and fall through.
          }
          openManagementPanel()
        })()
      }, [foldedGroup, openManagementPanel, uiWorkspace])

      const openSession = useCallback(id => {
        if (id === undefined) return
        if (archived.has(id)) { flash(t('toast.archived')); return }
        if (uiWorkspace?.openSession) uiWorkspace.openSession(id)
      }, [archived, flash, t, uiWorkspace])

      const toggleArchived = useCallback(async id => {
        const service = workspaceService
        if (!service) return
        try {
          if (archived.has(id)) await service.unarchiveSession(id)
          else await service.archiveSession(id)
        } catch (error) {
          flash(t('toast.archiveFailed', { message: error instanceof Error ? error.message : String(error) }))
        }
      }, [archived, flash, t, workspaceService])

      const hasPinnedApi = typeof workspaceService?.pinSession === 'function'
      const togglePin = useCallback(async id => {
        const service = workspaceService
        if (!service || typeof service.pinSession !== 'function') return
        try {
          if (pinned.has(id)) await service.unpinSession(id)
          else await service.pinSession(id)
        } catch (error) {
          flash(error instanceof Error ? error.message : String(error))
        }
      }, [flash, pinned, workspaceService])

      // ------------------------------------------------------------ render

      if (!wide) return null

      const renderStyle = h('style', null, CSS)
      const total = groups.reduce((sum, group) =>
        sum + (group.folded ? 0 : groupSessionCount(group)), 0)

      const renderDot = (status, summary) => {
        const kind = statusOf(status, summary)
        if (kind === 'idle') return null
        return h('span', { className: `sf-dot ${kind}` })
      }

      const indent = depth => ({ paddingInlineStart: `${8 + depth * 14}px` })

      const renderSessionRow = (id, options = {}) => {
        const summary = list.byId[id]
        if (summary === undefined) return null
        const status = statuses?.get?.(id)
        const selected = id === current
        const isArchived = archived.has(id)
        const title = summary.blank ? t('session.blank') : (summary.displayTitle || t('session.untitled'))
        const text = statusText(status, summary, t)
        const canPin = hasPinnedApi && !summary.blank
        return h('div', {
          key: `${options.groupKey ?? ''}:${id}`,
          className: `sf-row${selected ? ' selected' : ''}${isArchived ? ' archived' : ''}`,
          role: 'treeitem',
          'aria-selected': selected,
          tabIndex: 0,
          title: isArchived ? t('toast.archived') : title,
          style: indent(options.depth ?? 1),
          onClick: () => openSession(id),
          onKeyDown: event => {
            if (event.target !== event.currentTarget) return
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openSession(id) }
          },
        },
        h('span', { className: 'sf-slot' }, renderDot(status, summary)),
        h('span', { className: 'sf-row-title' }, title),
        options.subtitle !== undefined && h('span', { className: 'sf-subtitle' }, options.subtitle),
        pinned.has(id) && !isArchived && h('span', { className: 'sf-pin' }, h(IconPin)),
        h('span', { className: 'sf-row-meta' }, text ?? timeLabel(summary.updatedAt, now, t)),
        h('span', { className: 'sf-row-actions', onClick: event => event.stopPropagation() },
          canPin && h('button', {
            type: 'button',
            className: 'sf-action-button',
            'aria-label': pinned.has(id) ? t('action.unpin') : t('action.pin'),
            title: pinned.has(id) ? t('action.unpin') : t('action.pin'),
            onClick: () => { void togglePin(id) },
          }, h(IconPin)),
          !summary.blank && h('button', {
            type: 'button',
            className: 'sf-action-button',
            'aria-label': isArchived ? t('action.unarchive') : t('action.archive'),
            title: isArchived ? t('action.unarchive') : t('action.archive'),
            onClick: () => { void toggleArchived(id) },
          }, isArchived ? h(IconUnarchive) : h(IconArchive))),
        )
      }

      const renderSuperagentBar = (group, depth) => {
        const counts = group.counts ?? { running: 0, pending: 0, tasks: 0, sessions: 0 }
        const parts = []
        if (counts.pending > 0) {
          parts.push(h('span', { key: 'pending', className: 'sf-meta-part warn' },
            h('span', { className: 'sf-dot warn' }), t('superagent.pending', { n: counts.pending })))
        }
        if (counts.running > 0) {
          parts.push(h('span', { key: 'running', className: 'sf-meta-part running' },
            h('span', { className: 'sf-dot running' }), t('superagent.running', { n: counts.running })))
        }
        if (parts.length === 0) {
          parts.push(h('span', { key: 'tasks', className: 'sf-meta-part' },
            t('superagent.tasks', { n: counts.tasks })))
        }
        return h('div', {
          key: group.key,
          className: 'sf-superagent',
          role: 'button',
          style: indent(depth),
          title: t('superagent.open'),
          tabIndex: 0,
          onClick: openSuperagent,
          onKeyDown: event => {
            if (event.target !== event.currentTarget) return
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openSuperagent() }
          },
        },
        h('span', { className: 'sf-slot' }, h(IconStack)),
        h('span', { className: 'sf-group-label' }, group.label),
        h('span', { className: 'sf-superagent-meta' }, parts),
        h('span', { className: 'sf-superagent-open' }, h(IconChevron)),
        )
      }

      const renderGroupRow = (group, depth) => {
        const open = isExpanded(group.key)
        const count = groupSessionCount(group)
        return h('div', {
          key: group.key,
          className: `sf-group-row${group.folded ? ' folded' : ''}`,
          role: 'treeitem',
          'aria-expanded': open,
          style: indent(depth),
          onClick: () => toggleGroup(group.key),
          onKeyDown: event => {
            if (event.target !== event.currentTarget) return
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggleGroup(group.key) }
          },
          tabIndex: 0,
        },
        h('span', { className: 'sf-slot' },
          h('span', { className: `sf-chevron${open ? ' open' : ''}` }, h(IconChevron))),
        h('span', { className: 'sf-slot' }, h(IconFolder, { open })),
        h('span', { className: 'sf-group-label' }, group.label),
        h('span', { className: 'sf-group-count' }, String(count)),
        )
      }

      const renderGroup = (group, depth) => {
        // Containment is closed by design: worker sessions never re-enter the
        // sidebar list. The Superagent panel is their navigation surface.
        if (group.folded) return [renderSuperagentBar(group, depth)]
        const rows = [renderGroupRow(group, depth)]
        if (!isExpanded(group.key)) return rows
        for (const id of group.sessions) {
          rows.push(renderSessionRow(id, { groupKey: group.key, depth: depth + 1 }))
        }
        for (const child of group.children) rows.push(...renderGroup(child, depth + 1))
        return rows
      }

      const body = []
      if (searchResults !== undefined) {
        if (searchResults.length === 0) {
          body.push(h('div', { key: 'empty', className: 'sf-empty' }, t('empty.noMatches')))
        } else {
          for (const result of searchResults) {
            body.push(renderSessionRow(result.id, {
              groupKey: result.group.key,
              subtitle: result.subtitle ?? result.group.label,
              depth: 0,
            }))
          }
        }
      } else if (groups.length === 0) {
        body.push(h('div', { key: 'empty', className: 'sf-empty' }, t('empty.none')))
      } else {
        for (const group of groups) body.push(...renderGroup(group, 0))
      }

      const menu = menuOpen
        ? h('div', { className: 'sf-menu', role: 'menu', ref: menuRef },
          h('button', {
            type: 'button', role: 'menuitem',
            onClick: () => {
              const next = {}
              const walk = group => { next[group.key] = true; for (const child of group.children) walk(child) }
              for (const group of groups) walk(group)
              setExpanded(next)
              setMenuOpen(false)
            },
          }, t('menu.expandAll')),
          h('button', {
            type: 'button', role: 'menuitem',
            onClick: () => {
              const next = {}
              const walk = group => { next[group.key] = false; for (const child of group.children) walk(child) }
              for (const group of groups) walk(group)
              setExpanded(next)
              setMenuOpen(false)
            },
          }, t('menu.collapseAll')),
          h('button', {
            type: 'button', role: 'menuitem',
            onClick: () => { setShowArchived(value => !value); setMenuOpen(false) },
          }, showArchived ? t('menu.hideArchived') : t('menu.showArchived')),
        )
        : null

      return h('div', { className: 'sf-root' },
        renderStyle,
        h('div', { className: 'sf-header' },
          h('span', { className: 'sf-title' }, total > 0 ? `${t('section.title')} · ${total}` : t('section.title')),
          h('button', {
            type: 'button',
            className: 'sf-icon-button',
            'aria-label': searchOpen ? t('search.close') : t('search.aria'),
            title: t('search.aria'),
            onClick: () => {
              if (searchOpen && query === '') setSearchOpen(false)
              else if (searchOpen) { setQuery(''); setSearchOpen(false) }
              else setSearchOpen(true)
            },
          }, h(IconSearch)),
          h('button', {
            type: 'button',
            ref: moreRef,
            className: 'sf-icon-button',
            'aria-label': t('actions.more'),
            'aria-haspopup': 'menu',
            'aria-expanded': menuOpen,
            title: t('actions.more'),
            onClick: () => setMenuOpen(open => !open),
          }, h(IconMore)),
        ),
        searchOpen && h('div', { className: 'sf-search' },
          h('input', {
            ref: inputRef,
            type: 'search',
            value: query,
            placeholder: t('search.placeholder'),
            'aria-label': t('search.aria'),
            onChange: event => setQuery(event.target.value),
            onKeyDown: event => {
              if (event.key !== 'Escape') return
              event.preventDefault()
              if (query !== '') setQuery('')
              else setSearchOpen(false)
            },
          })),
        notice !== '' && h('div', { className: 'sf-notice', role: 'status' }, notice),
        h('div', {
          className: 'sf-list',
          ref: scroller?.bindScrollerRef,
          role: 'tree',
          'aria-label': t('section.title'),
          'data-sidebar-list-area': '',
        }, body),
        menu,
      )
    }

    // ---------------------------------------------------------------- apply

    return {
      inject: ['slots', 'locale', 'sessions', 'workspaces', 'uiWorkspace'],
      apply(ctx) {
        try {
          ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'superagent-session-fold: dictionaries')
          ctx.slots.inject('sidebar.workspaces', () => ctx.slots.register({
            name: 'sidebar.workspaces',
            priority: -10,
            locale: NS,
            inject: () => ({ ctx }),
          }, FoldRoot))
        } catch (error) {
          // Never leave the sidebar without a browsing region: the shipped
          // browser stays the winner when this registration never lands.
          console.error('dsh-superagent-session-fold: registration failed; keeping the built-in browser', error)
        }
      },
    }
  },
})
