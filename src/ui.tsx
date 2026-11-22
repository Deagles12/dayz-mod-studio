import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import {
  Check, ChevronDown, Circle, CircleAlert, CircleCheck, CircleX, Info, Loader, Search, Terminal, X,
} from 'lucide-react'

export type Tone = 'good' | 'warn' | 'neutral' | 'active' | 'danger' | 'info'

function toneIcon(tone: Tone) {
  if (tone === 'good') return CircleCheck
  if (tone === 'warn') return CircleAlert
  if (tone === 'danger') return CircleX
  if (tone === 'active') return Loader
  if (tone === 'info') return Info
  return Circle
}

export function Status({ tone, children, dot = false }: { tone: Tone; children: ReactNode; dot?: boolean }) {
  const Icon = toneIcon(tone)
  return (
    <span className={'status-pill ' + tone}>
      {dot ? <span className={'dot ' + (tone === 'neutral' ? '' : tone)} aria-hidden="true" /> : <Icon aria-hidden="true" className={tone === 'active' ? 'spin' : undefined} />}
      {children}
    </span>
  )
}

export function PageHeader({ eyebrow, title, description, actions, status }: {
  eyebrow?: ReactNode
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  status?: ReactNode
}) {
  return <header className="page-header">
    <div className="page-heading">
      {eyebrow && <div className="page-eyebrow">{eyebrow}</div>}
      <h1 className="page-title">{title}</h1>
      {description && <p className="page-description">{description}</p>}
    </div>
    {(status || actions) && <div className="page-actions">{status}{actions}</div>}
  </header>
}

export function Card({ title, description, icon, actions, children, className = '', danger = false, flush = false }: {
  title?: ReactNode
  description?: ReactNode
  icon?: ReactNode
  actions?: ReactNode
  children?: ReactNode
  className?: string
  danger?: boolean
  flush?: boolean
}) {
  return <section className={'card ' + (danger ? 'card-danger ' : '') + (flush ? 'card-flush ' : '') + className}>
    {(title || actions) && <header className="card-header">
      <div className="card-header-copy">
        {title && <h2 className="card-title">{icon}{title}</h2>}
        {description && <p className="card-description">{description}</p>}
      </div>
      {actions && <div className="card-actions">{actions}</div>}
    </header>}
    {children && <div className="card-body">{children}</div>}
  </section>
}

export function EmptyState({ icon, title, description, actions }: {
  icon?: ReactNode
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
}) {
  return <div className="empty-state">
    {icon && <div className="empty-icon">{icon}</div>}
    <h3>{title}</h3>
    {description && <p>{description}</p>}
    {actions && <div className="row">{actions}</div>}
  </div>
}

export function Switch({ checked, onChange, disabled, label, description, id }: {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  label: ReactNode
  description?: ReactNode
  id?: string
}) {
  const generated = useId()
  const inputId = id ?? generated
  return <label className="switch-field" htmlFor={inputId}>
    <span className="switch-copy">
      <span className="switch-label">{label}</span>
      {description && <span className="switch-desc">{description}</span>}
    </span>
    <input id={inputId} className="switch" type="checkbox" role="switch"
      checked={checked} disabled={disabled} onChange={event => onChange(event.target.checked)} />
  </label>
}

export function Notice({ tone = 'info', children, onDismiss, dismissLabel }: {
  tone?: 'info' | 'success' | 'warn' | 'error'
  children: ReactNode
  onDismiss?: () => void
  dismissLabel?: string
}) {
  const Icon = tone === 'error' ? CircleX : tone === 'warn' ? CircleAlert : tone === 'success' ? CircleCheck : Info
  return <div className={'notice ' + tone} role={tone === 'error' ? 'alert' : 'status'}>
    <Icon aria-hidden="true" />
    <div className="notice-copy">{children}</div>
    {onDismiss && <button className="icon-button" aria-label={dismissLabel ?? 'Dismiss'} data-tip={dismissLabel ?? 'Dismiss'} onClick={onDismiss}>
      <X aria-hidden="true" />
    </button>}
  </div>
}

export function Dialog({ title, description, children, footer, onClose, width = 'md', label }: {
  title: ReactNode
  description?: ReactNode
  children?: ReactNode
  footer?: ReactNode
  onClose: () => void
  width?: 'sm' | 'md'
  label?: string
}) {
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const initial = panel.current?.querySelector<HTMLElement>('[data-autofocus]') ?? panel.current
    initial?.focus()
    return () => { previous?.focus() }
  }, [])
  function keyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onClose()
    }
    if (event.key !== 'Tab' || !panel.current) return
    const focusable = Array.from(panel.current.querySelectorAll<HTMLElement>(
      'button:not(:disabled), [href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])'
    )).filter(node => node.offsetParent !== null && !node.matches(':disabled'))
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (!first || (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current))
      || (!event.shiftKey && document.activeElement === last)) {
      event.preventDefault()
      const target = event.shiftKey ? last : first
      target?.focus()
    }
  }
  return <div className="overlay" onPointerDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <div ref={panel} className={'modal ' + (width === 'sm' ? 'modal-sm' : '')} role="dialog" aria-modal="true"
      tabIndex={-1} onKeyDown={keyboard} aria-label={label ?? (typeof title === 'string' ? title : undefined)}>
      <header className="modal-header">
        <div className="modal-heading">
          <h2 className="modal-title">{title}</h2>
          {description && <p className="modal-description">{description}</p>}
        </div>
        <button className="icon-button" aria-label={label ?? 'Close'} data-tip={label ?? 'Close'} onClick={onClose}><X aria-hidden="true" /></button>
      </header>
      {children && <div className="modal-body">{children}</div>}
      {footer && <footer className="modal-footer">{footer}</footer>}
    </div>
  </div>
}

export function Menu({ label, children, disabled, className = '' }: {
  label: ReactNode; children: (close: () => void) => ReactNode; disabled?: boolean; className?: string
}) {
  const [open, setOpen] = useState(false)
  const wrapper = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const id = useId()
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])
  function close() { setOpen(false); trigger.current?.focus() }
  return <div ref={wrapper} className={'menu ' + className} onKeyDown={e => {
    if (e.key === 'Escape' && open) { e.stopPropagation(); close() }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) { setOpen(true); return }
      const options = Array.from(wrapper.current?.querySelectorAll<HTMLButtonElement>('.menu-body button:not(:disabled)') ?? [])
      const index = options.indexOf(document.activeElement as HTMLButtonElement)
      options[(index + (e.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length]?.focus()
    }
  }}>
    <button ref={trigger} className="menu-trigger" disabled={disabled} aria-expanded={open} aria-haspopup="menu" aria-controls={id} onClick={() => setOpen(!open)}>
      {label}<ChevronDown size={15} aria-hidden="true" />
    </button>
    {open && <div className="menu-body" id={id} role="menu">{children(close)}</div>}
  </div>
}

export function LogDrawer({ open, toggle, entries, logs, busy, read, tr }: {
  open: boolean; toggle: () => void; entries: { text: string; error: boolean }[]; logs: string[];
  busy: boolean; read: (path: string) => void; tr: (uk: string, en: string) => string
}) {
  const [height, setHeight] = useState(240)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const viewport = useRef<HTMLDivElement>(null)
  const follow = useRef(true)
  const visible = entries.filter(entry => (filter === 'all' || (filter === 'errors' ? entry.error : /warning|\(W\):/i.test(entry.text))) &&
    entry.text.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
  useEffect(() => {
    if (follow.current && viewport.current) viewport.current.scrollTop = viewport.current.scrollHeight
  }, [entries, open])
  const resize = (value: number) => setHeight(Math.max(140, Math.min(value, Math.floor(window.innerHeight * .55))))
  if (!open) return null
  return <section className="drawer" style={{ height }} aria-label={tr('Журнал', 'Log')}>
    <div className="splitter" role="separator" aria-orientation="horizontal" aria-label={tr('Висота журналу', 'Log height')} tabIndex={0}
      onKeyDown={e => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); resize(height + (e.key === 'ArrowUp' ? 16 : -16)) } }}
      onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); e.currentTarget.dataset.start = String(e.clientY); e.currentTarget.dataset.height = String(height) }}
      onPointerMove={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) resize(Number(e.currentTarget.dataset.height) + Number(e.currentTarget.dataset.start) - e.clientY) }} />
    <div className="drawer-tools">
      <strong className="drawer-title"><Terminal aria-hidden="true" />{tr('Журнал', 'Log')}</strong>
      <label className="search"><Search aria-hidden="true" /><input aria-label={tr('Пошук у журналі', 'Search the log')}
        placeholder={tr('Пошук…', 'Search…')} value={query} onChange={e => setQuery(e.target.value)} /></label>
      <div className="segments">{[['all', tr('Усі', 'All')], ['errors', tr('Помилки', 'Errors')], ['warnings', tr('Попередження', 'Warnings')]].map(([key, label]) =>
        <button key={key} aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}</button>)}
      </div>
      <Menu label={tr('Історія', 'History')} disabled={busy || !logs.length} className="up">
        {close => logs.map(path => <button key={path} role="menuitem" onClick={() => { read(path); close() }}>{path.split(/[\\/]/).pop()}</button>)}
      </Menu>
      <button className="icon-button" title={tr('Закрити журнал', 'Close log')} aria-label={tr('Закрити журнал', 'Close log')} onClick={toggle}><X aria-hidden="true" /></button>
    </div>
    <div ref={viewport} className="terminal" tabIndex={0} onScroll={e => { const node = e.currentTarget; follow.current = node.scrollHeight - node.scrollTop - node.clientHeight < 24 }}>
      {visible.length ? visible.map((entry, index) => <div key={index} className={(entry.error ? 'bad ' : '') + 'line'}>{entry.text}</div>) :
        <span className="dim">{entries.length ? tr('Збігів немає.', 'No matches.') : tr('Журнал поки порожній.', 'The log is empty.')}</span>}
    </div>
  </section>
}

export { Check }
