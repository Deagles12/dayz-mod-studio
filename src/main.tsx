import {
  Activity, Box, Bug, Check, ChevronRight, CircleAlert, ClipboardList, CloudUpload, Copy, FolderOpen,
  Folders, Gauge, Hammer, HardDrive, Image, KeyRound, Languages, Layers, ListFilter, Minus, Moon,
  Network, Package, Play, Plus, Power, RefreshCw, RotateCcw, Server, ServerCog, Settings2, ShieldCheck,
  SlidersHorizontal, Square, Sun, Terminal, Trash2, Wifi, X, Zap,
} from 'lucide-react'
import { Dialog, EmptyState, LogDrawer, Menu, Notice, PageHeader, Status, Switch } from './ui'
import { lazy, Suspense, useEffect, useRef, useState, type ComponentType } from 'react'
import { createRoot } from 'react-dom/client'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { open } from '@tauri-apps/plugin-dialog'
import { call, type Details, type Message, type Operation, type Project, type RunResult, type Settings } from './backend'
import { checks, fields, hints, pages, phases, type Lang, type Page } from './locale'
import './style.css'

const Models = lazy(() => import('./models').then(module => ({ default: module.Models })))

const Textures = lazy(() => import('./textures').then(module => ({ default: module.Textures })))

type Prefs = { language: Lang; theme: 'dark' | 'light'; projects: string[] }
type Action = 'quick' | 'deploy' | 'launch' | 'retry' | 'build' | 'test' | 'rollback' | 'publish' | 'retry-publish' | 'remote' | 'remote-check' | 'create-workshop'
const quickToggles = ['copy_server', 'copy_client', 'sign']
type Addon = {path: string; name: string; prefix: string; declared: string}
type AddonOptions = Record<string, {name?: string; prefix?: string}>
const addonFolders = (settings: Settings) => String(settings.addons || '').split(/\r?\n/).map(folder => folder.trim()).filter(Boolean)
function getAddonOptions(settings: Settings): AddonOptions {
  try { return JSON.parse(String(settings.addon_options || '{}')) || {} }
  catch { return {} }
}
fields.addon_builder = ['Файл AddonBuilder.exe', 'AddonBuilder.exe path', 'file']
hints.addon_builder = ['Типово використовується Bin/AddonBuilder/AddonBuilder.exe з папки DayZ Tools.',
  'Defaults to Bin/AddonBuilder/AddonBuilder.exe within DayZ Tools.']
fields.copy_server = ['Копіювати на сервер', 'Copy to server', 'bool']
fields.copy_client = ['Копіювати на клієнт', 'Copy to client', 'bool']
fields.sign = ['Підписувати PBO', 'Sign PBO files', 'bool']
fields.client_mods_root = ['Локальна папка тестових модів', 'Local test mod folder', 'folder']
fields.open_dayz = ['Відкрити DayZ після оновлення', 'Open DayZ after updating', 'bool']
fields.publish_workshop = ['Публікувати у Workshop', 'Publish to Workshop', 'bool']
fields.workshop = ['Посилання або ID Steam Workshop', 'Steam Workshop URL or ID', '']
fields.workshop_title = ['Назва нового item', 'New item title', '']
fields.workshop_description = ['Опис', 'Description', 'text']
fields.workshop_preview = ['Обкладинка PNG або JPEG', 'PNG or JPEG preview', 'file']
fields.workshop_visibility = ['Видимість (public, friends, private, unlisted)', 'Visibility (public, friends, private, unlisted)', '']
fields.remote_host = ['Адреса SSH', 'SSH host', '']
fields.remote_port = ['Порт SSH (типово 22)', 'SSH port (default 22)', '']
fields.remote_user = ['Користувач SSH', 'SSH username', '']
fields.remote_root = ['Папка DayZ на сервері', 'Remote DayZ directory', '']
fields.remote_mod = ['Папка мода (@Mod)', 'Mod directory (@Mod)', '']
fields.remote_keys = ['Папка публічних ключів', 'Remote public keys directory', '']
fields.remote_service = ['Служба systemd (.service)', 'systemd unit (.service)', '']
fields.remote_readiness = ['Команда перевірки готовності', 'Readiness command', '']
fields.remote_files_only = ['Лише завантаження через SFTP', 'SFTP upload only', 'bool']
hints.remote_user = ['Авторизація ключем через OpenSSH або ssh-agent.', 'Authenticate with an OpenSSH key or ssh-agent.']
hints.remote_readiness = ['Команда виконується через SSH. Код 0 означає готовність. Зберігай облікові дані на сервері.',
  'Runs over SSH. Exit code 0 means ready. Keep credentials on the server.']
fields.environment_override = ['Окреме середовище лише для цього проєкту', 'Use a different environment for this project', 'bool']
hints.client_mods_root = ['Вибери папку поза каталогом завантажень Steam. Порожнє поле використовує локальне сховище Studio.',
  'Choose a folder outside Steam downloads. Leaving this blank uses Studio’s local storage.']
hints.base = ['Одна папка або Workshop ID на рядок. Сервер і клієнт завантажують ту саму локальну версію.',
  'One directory or Workshop ID per line. The server and client load the same local version.']
const groups = [
  { title: ['Джерело й інструменти', 'Source and tools'], basic: ['addons','mod'], advanced: ['pack','addon_builder','addon_name','prefix','metadata','extra','prep_exe','prep_args'] },
  { title: ['Тестове середовище', 'Test environment'], basic: ['tools','server','client','config','base','open_dayz'], advanced: ['profiles','client_profiles','port','server_only','server_exe','client_exe','address','timeout','shared','server_args','client_args','client_mods_root','environment_override'] },
  { title: ['Підпис', 'Signing'], basic: ['sign','private','public'], advanced: [] },
  { title: ['Steam Workshop', 'Steam Workshop'], basic: ['publish_workshop','workshop','steam_owner','notes'], advanced: [] },
  { title: ['Віддалений сервер', 'Remote server'], basic: ['remote_host','remote_port','remote_user','remote_root','remote_mod','remote_files_only','remote_keys','remote_service','remote_readiness'], advanced: [] },
] as const

const defaultPrefs: Prefs = { language: 'uk', theme: 'dark', projects: [] }
const nameOf = (path: string) => path.split(/[\\/]/).pop() || path
const isError = (line: string) => /\[ERROR\]|\(E\):|can't compile|\b(error|fatal|failed)\s*:/i.test(line)
const desktop = '__TAURI_INTERNALS__' in window ? getCurrentWindow() : undefined
const previewParams = import.meta.env.DEV && !desktop ? new URLSearchParams(window.location.search) : undefined

const navGroups: { label: [string, string]; items: Page[] }[] = [
  { label: ['Робота', 'Work'], items: ['overview', 'projects', 'build'] },
  { label: ['Середовище', 'Environment'], items: ['server', 'workshop'] },
  { label: ['Інструменти', 'Tools'], items: ['settings', 'media'] },
]

const pageIcons: Record<Page, ComponentType<{ size?: number; className?: string }>> = {
  overview: Gauge, projects: Folders, build: Hammer, server: Server, workshop: CloudUpload, settings: Settings2, media: Image,
}

const pageDescriptions: Record<Page, [string, string]> = {
  overview: ['Збери, підпиши та розгорни активний проєкт. Один запуск: готовий тестовий мод.',
    'Build, sign and deploy the active project in a single run.'],
  projects: ['Робочі простори Studio. Обери проєкт, щоб продовжити роботу.',
    'Studio workspaces. Choose a project to continue.'],
  build: ['Повний стан конвеєра, історія збірок і команди для PowerShell.',
    'Full pipeline state, build history and PowerShell commands.'],
  server: ['Перевір середовище, запусти локальний тест або розгорни збірку віддалено.',
    'Check the environment, run a local test or deploy a build remotely.'],
  workshop: ['Публікація перевіреної збірки у Steam Workshop.',
    'Publish a verified build to Steam Workshop.'],
  settings: ['Джерела, інструменти, підпис і віддалене розгортання.',
    'Sources, tools, signing and remote deployment.'],
  media: ['Конвертація 3D-моделей і текстур для DayZ.', 'Convert 3D models and textures for DayZ.'],
}

const settingIcons = [FolderOpen, Server, Layers, KeyRound, CloudUpload, Network]

async function writeClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const active = document.activeElement
    const field = document.createElement('textarea')
    field.value = text
    field.style.position = 'fixed'
    field.style.opacity = '0'
    document.body.append(field)
    try {
      field.select()
      if (!document.execCommand('copy')) throw new Error('Clipboard write failed')
    } finally {
      field.remove()
      if (active instanceof HTMLElement) active.focus()
    }
  }
}

function App() {
  const [prefs, setPrefs] = useState(defaultPrefs)
  const [page, setPage] = useState<Page>(() => pages.find(([key]) => key === previewParams?.get('page'))?.[0] ?? 'overview')
  const [mediaTool, setMediaTool] = useState<'models' | 'textures'>('models')
  const toolPage = page === 'media'
  const showModels = toolPage && mediaTool === 'models'
  const showTextures = toolPage && mediaTool === 'textures'
  const [modelsVisited, setModelsVisited] = useState(false)
  const [modelStatus, setModelStatus] = useState('')
  const [texturesVisited, setTexturesVisited] = useState(false)
  const [textureStatus, setTextureStatus] = useState('')
  useEffect(() => {
    if (showModels) setModelsVisited(true)
    if (showTextures) setTexturesVisited(true)
  }, [showModels, showTextures])
  const [project, setProject] = useState<Project>()
  const [settings, setSettings] = useState<Settings>({})
  const [operationBusy, setBusy] = useState(false)
  const running = useRef(false)
  const [addons, setAddons] = useState<Addon[]>([])
  const [projectLoading, setProjectLoading] = useState(true)
  const [workspace, setWorkspace] = useState<string>()
  const busy = operationBusy || projectLoading
  const [advanced, setAdvanced] = useState(false)
  const [wizard, setWizard] = useState<number>()
  const [confirmation, setConfirmation] = useState<Action>()
  const [forceConfirm, setForceConfirm] = useState(false)
  const [run, setRun] = useState<{ action: Action; stage: number; label?: Message['label']; done?: boolean }>()
  const [entries, setEntries] = useState<{ text: string; error: boolean }[]>([])
  const [dependency, setDependency] = useState('')
  const [dependencyType, setDependencyType] = useState('base')
  const [settingsGroup,setSettingsGroup] = useState(1)
  const [live,setLive] = useState<'ready'|'offline'|'unknown'>('unknown')
  const [showLog, setShowLog] = useState(false)
  const [selectedReport, setSelectedReport] = useState<Operation>()
  const [notice, setNotice] = useState('')
  const [terminalAction, setTerminalAction] = useState('status')
  const [keyName, setKeyName] = useState('')
  const [checkedItem, setCheckedItem] = useState<{ input: string; title?: string; status: 'owner' | 'mismatch' | 'unknown' }>()
  const lng = prefs.language
  const settingsDirty = !!project && Object.entries(settings).some(([key, value]) => project.settings[key] !== value)
  const tr = (uk: string, en: string) => lng === 'en' ? en : uk
  const local = (pair: readonly [string, string]) => tr(...pair)
  const flagError = (error: unknown) => {
    setNotice(String(error instanceof Error ? error.message : error))
  }
  const openSettings = (group: number) => { setSettingsGroup(group); setPage('settings') }

  async function loadProject(root: string, preference = prefs, activate = true) {
    const found = await call<Project>(preference.language, 'open', {root})
    setProject(found)
    setSettings(found.settings)
    setEntries([])
    setSelectedReport(undefined)
    setRun(undefined)
    setNotice('')
    const log=found.details.logs[0]
    if(log) {
      const text=await call<string>(preference.language,'readLog',{root:found.root,path:log}).catch(()=>'')
      setEntries(text.split(/\r?\n/).filter(Boolean).map(text=>({text,error:isError(text)})))
    }
    if (activate) setPage('overview')
    setWizard(found.configured ? undefined : 0)
    setKeyName(String(found.settings.mod || '').replace(/^@/, '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 48))
    const next = {...preference, projects: [found.root, ...preference.projects.filter(path => path !== found.root)].slice(0, 30)}
    setPrefs(next)
    await call(next.language, 'preferences', {value: next})
  }
  useEffect(() => {
    const initialLang = previewParams?.get('lang') === 'en' ? 'en' : defaultPrefs.language
    call<{interface: Partial<Prefs>; workspace: string; recent: string | null}>(initialLang, 'hello').then(async data => {
      const next = {...defaultPrefs, ...data.interface}
      setPrefs(next)
      setWorkspace(data.workspace)
      if (data.recent && data.recent !== data.workspace) {
        try {
          await loadProject(data.recent, next, false)
          return
        } catch (error) {
          await loadProject(data.workspace, next, false)
          flagError(error)
          return
        }
      }
      await loadProject(data.workspace, next, false)
    }).catch(flagError).finally(() => setProjectLoading(false))
  }, [])
  useEffect(() => {
    document.documentElement.dataset.theme = prefs.theme
    document.documentElement.lang = lng
  }, [prefs.theme, lng])
  async function changePrefs(change: Partial<Prefs>) {
    const next = {...prefs, ...change}
    setPrefs(next)
    try {
      await call(next.language, 'preferences', {value: next})
      if (project && !busy) await refresh(next.language)
    } catch (error) { flagError(error) }
  }
  async function chooseProject(root?: string) {
    if (busy) return
    setProjectLoading(true)
    try {
      const folder = root ?? await open({directory: true, multiple: false, defaultPath: project?.root ?? workspace})
      if (typeof folder === 'string') await loadProject(folder)
    } catch (error) {
      flagError(error)
    } finally {
      setProjectLoading(false)
    }
  }
  async function stopSession(force: boolean) {
    if (!project || busy) return
    setBusy(true)
    try {
      await call(lng, force ? 'forceStopServer' : 'stopServer', {root: project.root, settings})
      setNotice(force ? tr('Сервер завершено.','The server has stopped.') : tr('Тестову сесію зупинено.','The test session has stopped.'))
      await refresh()
    } catch (error) { flagError(error) }
    finally { setBusy(false) }
  }
  async function refresh(language = lng, next = settings) {
    if (!project) return
    const details = await call<Details>(language, 'details', {root: project.root, settings: next})
    setProject(previous => previous?.root === project.root ? {...previous, details} : previous)
  }
  async function saveSettings(setup = false) {
    if (!project || busy) return
    setBusy(true)
    try {
      const details = await call<Details>(lng, setup ? 'saveQuick' : 'save', {root: project.root, settings})
      setProject({...project, configured: true, settings, details})
      setNotice(tr('Налаштування збережено.', 'Settings saved.'))
      setWizard(undefined)
      if (setup) setPage('overview')
    } catch (error) { flagError(error) }
    finally { setBusy(false) }
  }
  async function copyCommand(action: string) {
    if (!project || busy) return
    const shown = project.details.commands[action]
    if (!shown) return
    setBusy(true)
    try {
      let command = shown
      if (settingsDirty || !project.configured) {
        const details = await call<Details>(lng, 'save', {root: project.root, settings})
        setProject({...project, configured: true, settings, details})
        command = details.commands[action]
        if (action === 'remote' && command !== shown) {
          setNotice(tr('Налаштування збережено. Звір вибрану збірку F6 і скопіюй оновлену команду.',
            'Settings saved. Review the selected F6 build and copy the updated command.'))
          return
        }
      }
      if (command) await writeClipboard(command)
      setNotice(tr('Команду скопійовано для PowerShell.', 'PowerShell command copied.'))
    } catch (error) { flagError(error) }
    finally { setBusy(false) }
  }
  async function detect() {
    if (busy) return
    setBusy(true)
    try {
      const paths = await call<Settings>(lng, 'detect', {settings})
      const next = {...settings, ...paths}
      setSettings(next)
      setNotice(tr('Інсталяцій знайдено: ', 'Installations found: ') + Object.keys(paths).length)
    } catch (error) { flagError(error) }
    finally { setBusy(false) }
  }
  async function steamOwner() {
    if (!project || busy) return
    setBusy(true)
    try {
      const owner = await call<string>(lng, 'steamOwner', {root: project.root, settings})
      setSettings(previous => ({...previous, steam_owner: owner}))
    } catch (error) { flagError(error) }
    finally { setBusy(false) }
  }
  async function checkWorkshop() {
    if (!project || busy) return
    setBusy(true)
    try {
      const result = await call<{owner: string; title?: string; status: 'owner' | 'mismatch' | 'unknown'}>(
        lng, 'workshopCheck', {root: project.root, settings})
      setCheckedItem({input: String(settings.workshop), title: result.title, status: result.status})
      setSettings(previous => ({...previous, steam_owner: result.owner}))
      setNotice(result.status === 'owner'
        ? tr('Активний акаунт є власником DayZ item.', 'The active Steam account owns this DayZ item.')
        : result.status === 'mismatch'
        ? tr('Item належить іншому акаунту або грі.', 'The item belongs to another account or game.')
        : tr('Steam не надав публічних даних item.', 'Steam did not return public item details.'))
    } catch (error) { flagError(error) }
    finally { setBusy(false) }
  }
  async function generateKeys() {
    if (!project || busy) return
    setBusy(true)
    try {
      const keys = await call<Settings>(lng, 'generateKeys', {root: project.root, settings, name: keyName.trim()})
      const next = {...settings, ...keys}
      setSettings(next)
      await refresh(lng, next)
      setNotice(tr('Пару ключів створено. Збережи налаштування, щоб її використовувати.', 'Key pair created. Save settings to use it.'))
    } catch (error) { flagError(error) }
    finally { setBusy(false) }
  }
  async function start(action: Action) {
    if (!project || busy || running.current) return
    if (action === 'quick' && !project.configured) {
      setWizard(0)
      return
    }
    const buildId = action === 'remote' ? project.details.remoteChoice.buildId : undefined
    if (action === 'remote' && (!settings.remote_host || !buildId)) return
    if (action === 'test' && !ready) {
      setPage('server')
      setNotice(tr('Перевір налаштування тестового середовища.', 'Check the test environment settings.'))
      return
    }
    running.current = true
    setBusy(true)
    setConfirmation(undefined)
    setEntries([])
    setNotice('')
    setSelectedReport(undefined)
    setRun({action, stage: 0})
    if (action === 'quick') setPage('overview')
    try {
      const details = await call<RunResult>(lng, 'run', {root: project.root, settings, action, buildId}, message => {
        if (message.event === 'log' && message.text) {
          const text = message.text
          setEntries(previous => [...previous.slice(-2999), {text, error: isError(text)}])
        }
        if (message.event === 'progress') setRun({action, stage: message.stage ?? 0, label: message.label})
      })
      const saved = {...settings, workshop: details.workshopItem}
      setProject({...project, configured: true, settings: saved, details})
      setSettings(saved)
      setSelectedReport(details.currentOperation)
      setRun(previous => previous && {...previous, done: details.currentOperation.status === 'complete'})
      if (action === 'remote') setPage('server')
    } catch (error) {
      flagError(error)
      setEntries(previous => [...previous, {text: error instanceof Error ? error.message : String(error), error: true}])
      setRun(previous => previous && {...previous, done: false})
      await refresh().catch(() => undefined)
    } finally {
      running.current = false
      setBusy(false)
    }
  }
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'F5' || event.key === 'F6') {
        event.preventDefault()
        if (!event.repeat && wizard === undefined && !confirmation && !forceConfirm) void start(event.key === 'F5' ? 'quick' : 'remote')
      }
    }
    window.addEventListener('keydown', keyboard)
    return () => window.removeEventListener('keydown', keyboard)
  })
  useEffect(() => {
    if (!project || busy || settingsDirty || page !== 'overview') return
    let active = true
    const onFocus = () => {
      void call<Project>(lng, 'snapshot', {root: project.root}).then(found => {
        if (!active) return
        if (found.details.operations[0]?.date !== project.details.operations[0]?.date) {
          setSelectedReport(undefined)
          setRun(undefined)
        }
        setProject(found)
        setSettings(found.settings)
      }).catch(error => { if (active) flagError(error) })
    }
    window.addEventListener('focus', onFocus)
    return () => {
      active = false
      window.removeEventListener('focus', onFocus)
    }
  })
  async function reveal(path: string) {
    if (project) await call(lng, 'reveal', {root: project.root, path}).catch(flagError)
  }
  async function readLog(path: string) {
    if (!project || busy) return
    try {
      const text = await call<string>(lng, 'readLog', {root: project.root, path})
      setEntries(text.split(/\r?\n/).map(text => ({text,error:isError(text)})))
      setShowLog(true)
    } catch (error) { flagError(error) }
  }

  useEffect(()=>{
    setLive('unknown')
    if(!project || busy || page!=='server')return
    let cancelled=false
    const peek=()=>void call<'ready'|'offline'|'unknown'>(lng,'serverStatus',{root:project.root,settings})
      .then(value=>{if(!cancelled)setLive(value)}).catch(()=>{if(!cancelled)setLive('unknown')})
    peek()
    const timer=window.setInterval(peek,12000)
    return ()=>{cancelled=true;window.clearInterval(timer)}
  },[project?.root,project?.details.operations[0]?.date,busy,page,lng,settings.server,settings.port,settings.profiles,settings.server_exe])

  function dependencies() {
    const rows=['base','server_only'].flatMap(key=>String(settings[key]||'').split(/\r?\n/).map(path=>path.trim()).filter(Boolean).map((path,index)=>({path,key,order:index+1})))
    const required = project?.details.dependencies.filter(name => !name.toUpperCase().startsWith('DZ_')) || []
    function change(key:string, value:string, remove=false) {
      const items=String(settings[key]||'').split(/\r?\n/).map(path=>path.trim()).filter(Boolean)
      const normalized=value.trim()
      if(!normalized)return
      const next={...settings,[key]: (remove ? items.filter(path=>path!==normalized) : [...new Set([...items,normalized])]).join('\n')}
      setSettings(next)
      setDependency('')
      void refresh(lng,next).catch(flagError)
    }
    return <div className="dependency-list">
      {rows.length ? rows.map(({path,key,order})=>{
        const match = project?.details.dependencyState.find(row => row.entry===path && row.kind===key)
        return <div className="data-row" key={key+order}>
          <Box size={16} className="dim"/>
          <div className="grow"><strong title={path}>{order}. {nameOf(path)}</strong><small title={match?.path || path}>{match?.path || path}</small></div>
          {match && <Status tone={match.available?'good':'warn'}>{match.available ? tr('Файли є','Files available') : tr('Потрібна перевірка','Check required')}</Status>}
          <span className="badge">{key==='base'?tr('Спільна','Shared'):tr('Серверна','Server only')}</span>
          <button className="icon-button" title={tr('Видалити','Remove')} aria-label={tr('Видалити','Remove')} onClick={()=>change(key,path,true)}><Trash2 size={15}/></button>
        </div>}) : <p className="form-hint">{tr('Додаткових модів у запуску немає.','No additional mods in the launch list.')}</p>}
      {required.length > 0 && <p className="form-hint">{tr('Звір вручну класи requiredAddons із потрібними модами','Check these requiredAddons classes against the required mods')} · {required.join(', ')}</p>}
      <div className="dependency-add">
        <Menu label={dependencyType==='base'?tr('Спільна','Shared'):tr('Серверна','Server only')}>
          {close=>['base','server_only'].map(key=><button key={key} onClick={()=>{setDependencyType(key);close()}}>{key==='base'?tr('Спільна','Shared'):tr('Серверна','Server only')}</button>)}
        </Menu>
        <input aria-label={tr('Папка або Workshop ID','Folder or Workshop ID')} placeholder={tr('Папка або Workshop ID','Folder or Workshop ID')}
          value={dependency} onChange={e=>setDependency(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')change(dependencyType,dependency)}}/>
        <button title={tr('Вибрати папку','Browse folder')} aria-label={tr('Вибрати папку','Browse folder')} onClick={async()=>{
          try{const path=await open({directory:true,multiple:false});if(typeof path==='string')change(dependencyType,path)}catch(error){flagError(error)}
        }}><FolderOpen size={16}/></button>
        <button title={tr('Додати','Add')} aria-label={tr('Додати','Add')} disabled={!dependency.trim()} onClick={()=>change(dependencyType,dependency)}><Plus size={16}/></button>
      </div>
      <small className="form-hint">{tr('Зміни застосовуються після збереження або запуску тесту.','Changes apply when you save or start a test.')}</small>
    </div>
  }

  useEffect(() => {
    if (!project) return
    let active = true
    void call<Addon[]>(lng, 'addonInfo', {root: project.root, settings: {
      addons: settings.addons, addon_name: settings.addon_name, prefix: settings.prefix
    }}).then(value => { if (active) setAddons(value) }).catch(() => { if (active) setAddons([]) })
    return () => { active = false }
  }, [project?.root, settings.addons, settings.addon_name, settings.prefix, lng])

  async function scanAddons() {
    if (!project || busy) return
    setBusy(true)
    try {
      const found = await call<Addon[]>(lng, 'scanAddons', {root: project.root, settings})
      setSettings(previous => ({...previous, addons: found.map(item => item.path).join('\n')}))
      setNotice(found.length ? '' : tr('У цій папці не знайдено аддонів із config.cpp.',
                                       'No addons with config.cpp were found in this folder.'))
    } catch (error) { flagError(error) }
    finally { setBusy(false) }
  }

  function addonEditor() {
    const options = getAddonOptions(settings)
    const folders = addonFolders(settings)
    return <>
      {form(['addons', 'mod'])}
      <div className="row" style={{ marginTop: 'var(--space-3)' }}>
        <button type="button" onClick={() => void scanAddons()}><RefreshCw size={16}/>{tr('Знайти аддони', 'Detect addons')}</button>
      </div>
      <div className="addon-list">
        {folders.map((folder, index) => {
          const info = addons.find(addon => addon.path === folder)
          const key = folder.replace(/\\/g, '/')
          const update = (field: 'name' | 'prefix', value: string) => setSettings(previous => {
            const existing = getAddonOptions(previous)
            return {...previous, addon_options: JSON.stringify({...existing, [key]: {...existing[key], [field]: value}})}
          })
          const inferredPrefix = options[key]?.name && info && !info.declared && info.prefix === info.name && !(folders.length === 1 && settings.prefix)
            ? options[key].name : info?.prefix
          return <div className="addon-row" key={folder + index}>
            <strong title={folder}>{folder}</strong>
            <label>{tr('Назва PBO', 'PBO name')}<input value={options[key]?.name ?? ''} placeholder={info?.name}
              onChange={event => update('name', event.target.value)}/></label>
            <label>{tr('Префікс', 'Prefix')}<input value={options[key]?.prefix ?? ''} placeholder={inferredPrefix}
              onChange={event => update('prefix', event.target.value)}/></label>
          </div>
        })}
      </div>
    </>
  }

  async function toggleQuick(key: string, checked: boolean) {
    if (!project || busy) return
    const next = {...settings, [key]: checked}
    setSettings(next)
    if (!project.configured) return
    try {
      await call(lng, 'saveQuickToggles', {root: project.root, [key]: checked})
      setProject(previous => previous?.root === project.root ? {...previous, settings: {...previous.settings, [key]: checked}} : previous)
    } catch (error) { flagError(error) }
  }

  function form(keys: readonly string[]) {
    return <div className="form-grid">{keys.filter(key=>key!=='server_only').map(key => {
      if(key==='base')return <div key={key} className="form-field wide">{dependencies()}</div>
      const [uk, en, kind] = fields[key]
      const value = settings[key] ?? ''
      const update = (value: string | boolean) => setSettings(previous => ({...previous, [key]:value}))
      if (kind === 'bool') return <label className="form-check" key={key}><input type="checkbox" checked={Boolean(value)} onChange={e=>update(e.target.checked)}/>{tr(uk,en)}</label>
      return <div key={key} className={'form-field' + (kind==='text'?' wide':'')}>
        <label htmlFor={key}>{tr(uk,en)}</label>
        <div className="field-row">
          {kind === 'text' ? <textarea id={key} rows={key === 'base' ? 5 : 3} value={String(value)} onChange={e=>update(e.target.value)}/> :
            <input id={key} value={String(value)} onChange={e=>update(e.target.value)}/>}
          {(kind === 'file' || kind === 'folder') && <button className="btn-sm" onClick={async () => {
            try { const path = await open({directory:kind === 'folder', multiple:false}); if (typeof path === 'string') update(path) } catch(error) {flagError(error)}
          }}><FolderOpen size={15}/>{tr('Огляд…','Browse…')}</button>}
        </div>
        {hints[key] && <small className="form-hint">{local(hints[key])}</small>}
      </div>
    })}</div>
  }

  function readinessRows(compact = false) {
    return <div className="check-list">{project?.details.checks.map(check => {
      const disabled=check.key==='signing' && check.ok && !settings.sign
      const tone = disabled ? 'neutral' : check.ok ? 'good' : 'warn'
      const Icon = disabled ? CircleAlert : check.ok ? ShieldCheck : CircleAlert
      const target = check.key === 'project' ? () => void chooseProject() :
        check.key === 'sources' ? () => openSettings(0) :
        check.key === 'signing' ? () => openSettings(3) : () => openSettings(1)
      return <div className="check-row" key={check.key}>
        <span className={'check-icon ' + tone}><Icon aria-hidden="true"/></span>
        <div className="check-copy">
          <strong>{checks[check.key] ? local(checks[check.key]) : check.key}</strong>
          <small title={check.detail}>{check.detail}</small>
        </div>
        <Status tone={tone}>{disabled?tr('Вимкнено','Disabled'):check.ok?tr('Перевірено','Verified'):tr('Потрібна увага','Needs attention')}</Status>
        {(!check.ok || disabled) && !compact && <button className="btn-sm check-action" disabled={busy}
          onClick={target}>{disabled?tr('Увімкнути','Enable'):tr('Виправити','Fix')}</button>}
        {(!check.ok || disabled) && compact && <button className="icon-button" data-tip={tr('Налаштувати','Configure')}
          aria-label={tr('Налаштувати','Configure')} disabled={busy} onClick={target}><ChevronRight/></button>}
      </div>
    })}</div>
  }

  const operationNames: Record<string, [string,string]> = {
    quick:['Швидка збірка','Quick build'], deploy:['Встановлення','Deployment'], launch:['Запуск тесту','Launch test'], test:['Тестування','Test'], retry:['Продовження тесту','Resume test'], build:['Збірка','Build'],
    rollback:['Відкат','Rollback'], publish:['Оновлення Workshop','Workshop update'],
    'retry-publish':['Повторна публікація','Retry publication'],
    remote:['Віддалене встановлення','Remote deployment'], 'remote-check':['Перевірка SSH/SFTP','SSH/SFTP check'],
    'create-workshop':['Перша публікація Workshop','First Workshop publication']
  }
  function operation(report: Operation) {
    const test = ['test','retry','deploy','launch'].includes(report.action)
    const failed = report.status==='failed'
    const phase = report.phase > 0 ? local(phases[report.phase-1]) : tr('Підготовка','Preflight')
    return <section className="report-card">
      <div className="card-header">
        <div className="card-header-copy">
          <h2>{local(operationNames[report.action])}</h2>
          <p>{report.buildId && report.buildId + ' · '}{report.seconds} {tr('с','s')} · {tr('Попереджень у журналі','Warnings in log')}: {report.warnings}</p>
        </div>
        <Status tone={failed ? (report.attention ? 'warn' : 'danger') : 'good'}>
          {failed?(report.attention?tr('Потребує уваги','Needs attention'):tr('Помилка','Error')):tr('Завершено','Complete')}
        </Status>
      </div>
      {report.built && <p>{tr('Пакет перевірено','Package verified')} · {report.signed?tr('підпис перевірено','signature verified'):tr('без підпису','unsigned')}</p>}
      {test && <div className="data-list" style={{ marginTop: 'var(--space-2)' }}>
        <div className="data-row"><span className="dim">{tr('Мод','Mod')}</span><span className="grow"/><strong>{report.installed?tr('копії перевірено','copies verified'):tr('оновлення не підтверджено','update not verified')}</strong></div>
        <div className="data-row"><span className="dim">{tr('Сервер','Server')}</span><span className="grow"/><strong>{report.serverReady?tr('місія й порт підтверджені','mission and port confirmed'):tr('готовність не підтверджена','readiness not confirmed')}</strong></div>
        <div className="data-row"><span className="dim">{tr('Клієнт','Client')}</span><span className="grow"/><strong>{report.connected?tr('сервер підтвердив підключення','connection confirmed by the server'):
          report.clientLaunched?tr('запущено, підключення не підтверджене','launched, connection not confirmed'):tr('не запускали','not launched')}</strong></div>
      </div>}
      {failed && <div className="alert" style={{ marginTop: 'var(--space-3)' }}><CircleAlert aria-hidden="true"/><div className="alert-copy">
        <strong>{test && !report.workshopStatus ? phase : tr('Операція не завершилася','Operation failed')}</strong>
        <span>{report.error}</span>
      </div></div>}
      {report.workshopStatus === 'confirmed' && <p>{tr('Steam підтвердив публікацію.','Steam confirmed the publication.')}</p>}
      {report.clientError && <p>{tr('Помилка запуску DayZ','DayZ launch error')} · {report.clientError}</p>}
      {report.serverReady && <p>{tr('Перевір поведінку мода у грі.','Check the mod’s behavior in game.')}</p>}
      {report.remote?.staging && <small className="form-hint" title={report.remote.staging}>{tr('Проміжна папка','Staging directory')} · {report.remote.staging}</small>}
      {report.remote?.status === 'uploaded' && <p>{tr('Файли завантажено; потрібне ручне встановлення й перезапуск.',
        'Files uploaded. Manual installation and restart required.')}</p>}
      {!!report.updated.length && <details><summary>{tr('Оновлені папки та ключі','Updated folders and keys')}</summary>
        {report.updated.map(path=><small key={path}>{path}</small>)}</details>}
      {!!report.files.length && <details><summary>{tr('Файли пакета','Package files')} ({report.files.length})</summary>
        {report.files.map(path=><small key={path}>{path}</small>)}</details>}
      <div className="row" style={{ marginTop: 'var(--space-3)' }}>
        <button className="btn-sm" disabled={busy} onClick={()=>void readLog(report.log)}><Terminal size={15}/>{tr('Технічний журнал','Technical log')}</button>
        {failed && test && project?.details.retry && report.date===project.details.operations[0]?.date &&
          <button className="btn-sm" disabled={busy} onClick={()=>void start('retry')}>{tr('Продовжити без збірки','Resume without rebuilding')}</button>}
        {failed && <button className="btn-sm" onClick={()=>setWizard(0)}>{tr('Перевірити налаштування','Check setup')}</button>}
        {failed && report.action==='deploy' && <button className="btn-sm" disabled={busy} onClick={()=>void start('deploy')}>{tr('Повторити встановлення','Retry deployment')}</button>}
        {failed && report.action==='build' && <button className="btn-sm" disabled={busy} onClick={()=>void start('build')}>{tr('Повторити збірку','Retry build')}</button>}
      </div>
      {failed && report.next && project?.details.operations[0]?.date === report.date && commandLine(report.next.action)}
    </section>
  }
  function commandLine(action: string) {
    const command = project?.details.commands[action]
    if (!command) return null
    return <div className="command-line">
      <code>{command}</code>
      <button className="btn-sm" disabled={busy} onClick={()=>void copyCommand(action)}><Copy size={15}/>{tr('Скопіювати','Copy')}</button>
    </div>
  }
  const title = pages.find(item=>item[0]===page)!
  const pageTitle = tr(title[1], title[2])
  const pageGroup = navGroups.find(group => group.items.includes(page))?.label
  const stageText = !run ? tr('Готово', 'Ready') : run.done === false ? tr('Операція завершилася помилкою', 'Operation failed') :
    run.done ? tr('Операцію завершено', 'Operation complete') : Array.isArray(run.label) ? local(run.label) :
    run.label || tr('Перевірка середовища…', 'Checking environment…')
  const setupSteps = [
    tr('Вихідні файли та аддони', 'Source files and addons'),
    tr('DayZ Tools і папки встановлення', 'DayZ Tools and installation folders'),
    tr('Цифровий підпис', 'Digital signing')
  ]
  const ready = !!project && project.configured && project.details.checks.length>0 && project.details.checks.every(check=>check.ok)
  const serverState = live==='ready' ? tr('Порт активний','Listening') : live==='offline' ? tr('Не запущено','Stopped') : tr('Немає підтвердження','Unverified')
  const lastBuild=project?.details.operations.find(item=>['test','retry','build','deploy','launch'].includes(item.action))
  const lastQuick=project?.details.operations.find(item=>item.action==='quick')
  const latestPackage=project?.details.builds[0]
  const quickActive = operationBusy && run?.action === 'quick'
  const quickPbos = lastQuick?.files.filter(name => name.toLowerCase().endsWith('.pbo')) ?? []
  const startButton = <button className="primary btn-lg" disabled={busy || !project} onClick={()=>void start('quick')}>
    <Play size={18}/>{tr('Зібрати та встановити','Build and deploy')} <kbd>F5</kbd></button>
  const projectPaths = [...new Set(workspace ? [workspace, ...prefs.projects] : prefs.projects)]
  const noticeTone = /(помилк|не вдалося|error|failed|could not|can't)/i.test(notice) ? 'error' : 'info'
  const quickStages = [
    { title: tr('Перевірка джерел','Source validation'), hint: tr('config.cpp, аддони та префікси','config.cpp, addons and prefixes'), enabled: true, done: !!lastQuick?.built, phase: 1 },
    { title: tr('Збірка PBO','PBO build'), hint: tr('AddonBuilder пакує аддони у PBO','AddonBuilder packages addons into PBO'), enabled: true, done: !!lastQuick?.built, phase: 1 },
    { title: tr('Підписування','Signing'), hint: tr('DSSignFile і перевірка публічного ключа','DSSignFile and public key verification'), enabled: !!settings.sign, done: !!lastQuick?.signed, phase: 2 },
    { title: tr('Розгортання на сервер','Server deployment'), hint: tr('PBO і ключі копіюються у папку сервера','PBO and keys are copied to the server'), enabled: !!settings.copy_server, done: !!lastQuick?.installed, phase: 3 },
    { title: tr('Розгортання на клієнт','Client deployment'), hint: tr('Локальна копія мода для тесту','Local mod copy for testing'), enabled: !!settings.copy_client, done: !!lastQuick?.installed, phase: 3 },
  ]
  const quickRunning = quickActive ? Math.min(run?.stage ?? 0, 4) : -1
  const quickFailed = !quickActive && lastQuick?.status === 'failed' ? lastQuick.phase : -1
  const openBuildFolder = () => { if (latestPackage) void reveal(latestPackage.path) }
  const settingsTabs = [
    { title: groups[0].title, description: tr('Де лежать вихідні файли та як збирати PBO.','Where the sources live and how PBOs are built.') },
    { title: groups[1].title, description: tr('DayZ Tools, сервер, клієнт і профілі тестування.','DayZ Tools, server, client and test profiles.') },
    { title: ['Залежності','Dependencies'] as const, description: tr('Спільні та серверні моди для запуску.','Shared and server-only mods for launch.') },
    { title: groups[2].title, description: tr('Ключі підписування PBO.','Keys used to sign PBO files.') },
    { title: groups[3].title, description: tr('Публікація перевіреної збірки у Steam Workshop.','Publish a verified build to Steam Workshop.') },
    { title: groups[4].title, description: tr('SSH/SFTP для віддаленого розгортання.','SSH/SFTP for remote deployment.') },
  ]

  return <div className="app">
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="brand-mark"><Box size={20} aria-hidden="true"/></span>
        <span className="brand-copy">
          <span className="brand-name">DayZ Mod Studio</span>
          <span className="brand-meta">{tr('Версія','Version')} 2.3</span>
        </span>
      </div>
      <nav className="nav" aria-label={tr('Розділи','Sections')}>
        {navGroups.map(group => <div className="nav-group" key={group.label[1]}>
          <span className="nav-label">{local(group.label)}</span>
          {group.items.map(key => {
            const item = pages.find(entry => entry[0] === key)!
            const Icon = pageIcons[key]
            return <button key={key} className="nav-item" aria-current={page===key?'page':undefined}
              aria-label={tr(item[1], item[2])} title={tr(item[1], item[2])} onClick={()=>setPage(key)}>
              <Icon aria-hidden="true"/><span>{tr(item[1], item[2])}</span>
            </button>
          })}
        </div>)}
      </nav>
      <div className="sidebar-footer">
        <div className="sidebar-status">
          <span className={'dot ' + (busy ? 'active' : ready ? 'good' : project ? 'warn' : '')}/>
          <span>{busy ? tr('Виконується операція','Operation running') : ready ? tr('Середовище готове','Environment ready') : project ? tr('Потрібне налаштування','Setup needed') : tr('Проєкт не вибрано','No project')}</span>
        </div>
      </div>
    </aside>

    <div className="shell">
      <header className="topbar" data-tauri-drag-region>
        <Menu className="project-switch" disabled={busy} label={<>
          <span className="context-icon"><FolderOpen size={16} aria-hidden="true"/></span>
          <span className="context-copy">
            <strong className="context-name">{project?nameOf(project.root):tr('Проєкт не вибрано','No project selected')}</strong>
            <small className="context-path" title={project?.root}>{project?.root ?? tr('Відкрий папку проєкту','Open a project folder')}</small>
          </span>
        </>}>
          {close=><>{projectPaths.map(path=><button key={path} role="menuitem" title={path} onClick={()=>{close();void chooseProject(path)}}>
            <Folders size={15}/><span>{nameOf(path)}</span>{path===project?.root&&<span className="dim">•</span>}</button>)}
            <button role="menuitem" onClick={()=>{close();void chooseProject()}}><Plus size={15}/>{tr('Відкрити папку…','Open folder…')}</button></>}
        </Menu>
        {project && <Status tone={busy?'active':ready?'good':'warn'} dot>
          {busy?tr('Виконується','Working'):ready?tr('Готово','Ready'):tr('Потрібне налаштування','Setup needed')}
        </Status>}
        <div className="topbar-actions">
          <button className="icon-button hide-sm" disabled={busy} title={tr('Відкрити папку проєкту','Open project folder')}
            aria-label={tr('Відкрити папку проєкту','Open project folder')} data-tip={tr('Відкрити папку','Open folder')}
            onClick={()=>void chooseProject()}><FolderOpen size={17}/></button>
          <div className="segments" aria-label={tr('Мова','Language')}>
            <button disabled={projectLoading} aria-pressed={lng==='uk'} onClick={()=>void changePrefs({language:'uk'})}>UA</button>
            <button disabled={projectLoading} aria-pressed={lng==='en'} onClick={()=>void changePrefs({language:'en'})}>EN</button>
          </div>
          <button className="icon-button hide-sm" aria-pressed={showLog} title={tr('Журнал','Log')} aria-label={tr('Журнал','Log')}
            data-tip={tr('Журнал операцій','Operation log')} onClick={()=>setShowLog(!showLog)}><Terminal size={17}/></button>
          {desktop && <div className="window-buttons">
            <button aria-label={tr('Згорнути','Minimize')} title={tr('Згорнути','Minimize')} onClick={()=>void desktop.minimize()}><Minus size={15}/></button>
            <button aria-label={tr('Розмір вікна','Resize window')} title={tr('Розмір вікна','Resize window')} onClick={()=>void desktop.toggleMaximize()}><Square size={13}/></button>
            <button className="close" aria-label={tr('Закрити','Close')} title={tr('Закрити','Close')} disabled={busy} onClick={()=>void desktop.close()}><X size={16}/></button>
          </div>}
        </div>
      </header>

      <main className="content">
        <div className="content-inner">
          <PageHeader eyebrow={pageGroup ? local(pageGroup) : undefined} title={pageTitle}
            description={local(pageDescriptions[page])}
            status={page==='overview' && project ? <Status tone={busy?'active':ready?'good':'warn'} dot>
              {busy?tr('Виконується','Working'):ready?tr('Готово до збірки','Ready to build'):tr('Потрібне налаштування','Setup needed')}
            </Status> : undefined}
            actions={page==='projects' ? <button className="primary" disabled={busy} onClick={()=>void chooseProject()}>
              <Plus size={17}/>{tr('Додати проєкт','Add project')}</button> : page==='settings' ?
              <div className="segments" role="group" aria-label={tr('Тема оформлення','Appearance')}>
                <button aria-pressed={prefs.theme==='dark'} onClick={()=>void changePrefs({theme:'dark'})}>
                  <Moon size={15} aria-hidden="true"/>{tr('Темна','Dark')}
                </button>
                <button aria-pressed={prefs.theme==='light'} onClick={()=>void changePrefs({theme:'light'})}>
                  <Sun size={15} aria-hidden="true"/>{tr('Світла','Light')}
                </button>
              </div> : undefined}/>

          {notice && wizard === undefined &&
            <Notice tone={noticeTone} onDismiss={()=>setNotice('')} dismissLabel={tr('Закрити повідомлення','Dismiss message')}>{notice}</Notice>}

          {page==='projects' && <div className="project-grid">
            {projectPaths.map(path=><button className="project-tile" key={path} data-current={path===project?.root}
              disabled={busy} onClick={()=>void chooseProject(path)}>
              <span className="project-tile-head">
                <span className="project-tile-icon"><Box size={18}/></span>
                <span className="grow"><strong>{nameOf(path)}</strong><small>{path}</small></span>
              </span>
              <span className="project-tile-meta">
                {path===project?.root && <span className="badge accent">{tr('Активний','Active')}</span>}
                <span className="badge">{tr('Відкрити','Open')}</span>
              </span>
            </button>)}
            <button className="project-tile" disabled={busy} onClick={()=>void chooseProject()}>
              <span className="project-tile-head">
                <span className="project-tile-icon"><Plus size={18}/></span>
                <span className="grow"><strong>{tr('Додати проєкт','Add project')}</strong><small>{tr('Вибрати папку з вихідними файлами','Choose a source folder')}</small></span>
              </span>
            </button>
          </div>}

          {!project && !['projects','settings','media'].includes(page) &&
            <EmptyState icon={<Box size={22}/>} title={tr('Спочатку відкрий проєкт','Open a project first')}
              description={tr('Вибери папку з config.cpp, щоб збирати PBO, тестувати мод і публікувати його у Workshop.',
                'Choose a folder with config.cpp to build PBOs, test the mod and publish it to Workshop.')}
              actions={<><button className="primary" disabled={busy} onClick={()=>void chooseProject()}>{tr('Вибрати проєкт','Choose project')}</button>
                <button onClick={()=>setPage('media')}><Image size={16}/>{tr('Моделі й текстури','Models and textures')}</button></>}/>}

          {toolPage && <div className="media-tools" role="group" aria-label={tr('Інструменти конвертації','Conversion tools')}>
            <button aria-pressed={showModels} onClick={()=>setMediaTool('models')}><Box size={16}/>{tr('3D-моделі','3D models')}</button>
            <button aria-pressed={showTextures} onClick={()=>setMediaTool('textures')}><Image size={16}/>{tr('Конвертація текстур','Texture conversion')}</button>
          </div>}
          {(modelsVisited || showModels) && <div hidden={!showModels}>
            <Suspense fallback={<p role="status" className="muted">{tr('Завантажую перегляд…', 'Loading preview…')}</p>}>
              <Models language={lng} root={project?.root} settings={settings} onStatus={setModelStatus}/>
            </Suspense>
          </div>}
          {(texturesVisited || showTextures) && <div hidden={!showTextures}>
            <Suspense fallback={<p role="status" className="muted">{tr('Відкриваю текстури…', 'Loading textures…')}</p>}>
              <Textures language={lng} settings={settings} onStatus={setTextureStatus}/>
            </Suspense>
          </div>}

          {project && page==='overview' && <>
            <div className="quick-layout">
              <div className="quick-main">
                <section className="card build-hero">
                  <div className="build-hero-top">
                    <div className="project-avatar"><Box size={22}/></div>
                    <div className="build-hero-copy">
                      <div className="build-hero-title">
                        <h2>{nameOf(project.root)}</h2>
                        <span className="badge accent">{tr('Активний проєкт','Active project')}</span>
                      </div>
                      <p className="build-hero-path" title={project.root}>{project.root}</p>
                    </div>
                    <div className="build-hero-status">
                      <Status tone={busy?'active':ready?'good':'warn'} dot>
                        {busy?tr('Виконується','Working'):ready?tr('Готово до збірки','Ready to build'):tr('Потрібне налаштування','Setup needed')}
                      </Status>
                    </div>
                  </div>
                  <div className="build-hero-actions">
                    {startButton}
                    <div className="build-hint">
                      <span className={'dot ' + (ready?'good':'warn')}/>
                      {ready ? tr('Усі перевірки пройдено','All checks passed') :
                        tr('Виправ налаштування перед збіркою','Fix the setup before building')}
                    </div>
                  </div>
                  <div className="build-options">
                    {quickToggles.map(key => {
                      const description = key==='copy_server' ? tr('Скопіювати PBO у папку сервера','Copy PBOs to the server folder')
                        : key==='copy_client' ? tr('Оновити локальну копію мода','Refresh the local mod copy')
                        : tr('Підписати PBO та перевірити ключі','Sign PBOs and verify the keys')
                      return <Switch key={key} checked={Boolean(settings[key])} disabled={busy}
                        onChange={checked=>void toggleQuick(key, checked)}
                        label={tr(fields[key][0], fields[key][1])} description={description}/>
                    })}
                  </div>
                  {quickActive && <div className="hero-progress" aria-live="polite">
                    <div className="hero-progress-row">
                      <strong>{stageText}</strong>
                      <span className="dim">{Math.min(run?.stage ?? 0, 4)} / 4</span>
                    </div>
                    <progress aria-label={tr('Прогрес швидкої збірки','Quick build progress')} max={settings.copy_client ? 4 : settings.copy_server ? 3 : settings.sign ? 2 : 1} value={run?.stage ?? 0}/>
                  </div>}
                </section>

                <section className="card">
                  <header className="card-header">
                    <div className="card-header-copy">
                      <h2 className="card-title"><Hammer aria-hidden="true"/>{tr('Конвеєр збірки','Build pipeline')}</h2>
                      <p className="card-description">{tr('Кроки виконуються послідовно; пропущені етапи вимкнені в параметрах.',
                        'Steps run in order; skipped stages are disabled in the options.')}</p>
                    </div>
                    <div className="card-actions">
                      <Status tone={quickActive?'active':lastQuick?.status==='complete'?'good':lastQuick?.status==='failed'?'danger':'neutral'}>
                        {quickActive?tr('Виконується','Running'):lastQuick?.status==='complete'?tr('Остання збірка успішна','Last build succeeded'):lastQuick?.status==='failed'?tr('Остання збірка з помилкою','Last build failed'):tr('Збірку ще не запускали','No build yet')}
                      </Status>
                    </div>
                  </header>
                  <div className="pipeline">
                    {quickStages.map((stage,index)=>{
                      let state: 'done'|'running'|'error'|'pending'|'skipped' = 'pending'
                      if (!stage.enabled) state = 'skipped'
                      else if (quickActive) state = index < quickRunning ? 'done' : index === quickRunning ? 'running' : 'pending'
                      else if (quickFailed === index) state = 'error'
                      else if (stage.done || (index < 2 && quickFailed > index)) state = 'done'
                      const tone = state==='done'?'good':state==='running'?'active':state==='error'?'danger':'neutral'
                      const label = state==='done'?tr('Готово','Done'):state==='running'?tr('Виконується','Running'):
                        state==='error'?tr('Помилка','Error'):state==='skipped'?tr('Пропущено','Skipped'):tr('Очікує','Pending')
                      return <div className="pipeline-step" data-state={state} key={stage.title}>
                        <span className="pipeline-marker">{state==='done'?<Check aria-hidden="true"/>:state==='error'?<X aria-hidden="true"/>:index+1}</span>
                        <div className="pipeline-copy"><strong>{stage.title}</strong><small>{stage.hint}</small></div>
                        <Status tone={tone}>{label}</Status>
                      </div>
                    })}
                  </div>
                </section>

                <section className="card">
                  <header className="card-header">
                    <div className="card-header-copy">
                      <h2 className="card-title"><Terminal aria-hidden="true"/>{tr('Результат збірки','Build output')}</h2>
                      <p className="card-description">{tr('Останній запуск, файли пакета та швидкий доступ до журналу.',
                        'Latest run, package files and quick access to the log.')}</p>
                    </div>
                    <div className="card-actions">
                      <button className="btn-sm" aria-expanded={showLog} onClick={()=>setShowLog(!showLog)}><Terminal size={15}/>{tr('Журнал','Log')}</button>
                    </div>
                  </header>
                  {quickActive ? <div className="hero-progress">
                    <div className="hero-progress-row"><strong>{stageText}</strong><span className="dim">{tr('Виконується','Running')}</span></div>
                    <progress aria-label={tr('Прогрес швидкої збірки','Quick build progress')} max={5} value={run?.stage ?? 0}/>
                  </div> : lastQuick ? <>
                    <div className="output-summary">
                      <Status tone={lastQuick.status==='complete'?'good':'danger'} dot>
                        {lastQuick.status==='complete'?tr('Успішно','Successful'):tr('Помилка','Error')}
                      </Status>
                      <span className="output-meta">
                        {new Date(lastQuick.date).toLocaleString(lng==='uk'?'uk-UA':'en-US')}
                        {' · '}{lastQuick.seconds} {tr('с','s')}
                        {' · '}{tr('попереджень','warnings')}: {lastQuick.warnings}
                      </span>
                    </div>
                    {lastQuick.error && <div className="alert" style={{ marginTop: 'var(--space-3)' }}><CircleAlert aria-hidden="true"/>
                      <div className="alert-copy"><strong>{tr('Збірка не завершилася','Build did not finish')}</strong><span>{lastQuick.error}</span></div></div>}
                    {!!quickPbos.length && <div className="output-section">
                      <div className="output-section-title">{tr('Файли PBO','PBO files')}</div>
                      <div className="file-chips">{quickPbos.map(name=><span className="chip" key={name}><Package size={13}/>{name.split('/').pop()}</span>)}</div>
                    </div>}
                    {!!lastQuick.updated.length && <div className="output-section">
                      <div className="output-section-title">{tr('Оновлені папки та ключі','Updated folders and keys')}</div>
                      <div className="file-chips">{lastQuick.updated.map(path=><span className="chip" key={path} title={path}>{path}</span>)}</div>
                    </div>}
                    <div className="output-actions">
                      <button className="btn-sm" disabled={!latestPackage} onClick={openBuildFolder}><FolderOpen size={15}/>{tr('Відкрити папку збірки','Open build folder')}</button>
                      <button className="btn-sm" disabled={busy} onClick={()=>void readLog(lastQuick.log)}><Terminal size={15}/>{tr('Технічний журнал','Technical log')}</button>
                      {lastQuick.status==='failed' && <button className="btn-sm primary" disabled={busy} onClick={()=>setWizard(0)}><SlidersHorizontal size={15}/>{tr('Виправити налаштування','Fix setup')}</button>}
                    </div>
                  </> : <EmptyState icon={<Package size={22}/>} title={tr('Ще немає збірок','No builds yet')}
                    description={tr('Запусти першу збірку, щоб побачити файли, тривалість і журнал операції.',
                      'Run the first build to see files, duration and the operation log.')}
                    actions={<button className="primary" disabled={busy} onClick={()=>void start('quick')}><Play size={16}/>{tr('Зібрати зараз','Build now')}</button>}/>}
                </section>
              </div>

              <aside className="quick-rail">
                <section className="card">
                  <div className="rail-heading"><span>{tr('Готовність','Readiness')}</span>
                    <Status tone={ready?'good':'warn'}>{ready?tr('Готово','Ready'):tr('Є зауваження','Attention')}</Status>
                  </div>
                  {readinessRows(true)}
                </section>
                <section className="card">
                  <div className="rail-heading"><span>{tr('Остання збірка','Last build')}</span><Activity size={16}/></div>
                  {lastQuick ? <dl className="metric-grid">
                    <div className="metric"><dt>{tr('Час','Time')}</dt><dd>{lastQuick.seconds} s</dd></div>
                    <div className="metric"><dt>PBO</dt><dd>{quickPbos.length || '-'}</dd></div>
                    <div className="metric"><dt>{tr('Попередження','Warnings')}</dt><dd className={lastQuick.warnings?'warn':''}>{lastQuick.warnings}</dd></div>
                    <div className="metric"><dt>{tr('Підпис','Signature')}</dt><dd className={lastQuick.signed?'good':''}>{lastQuick.signed?tr('Є','Signed'):settings.sign?tr('Немає','Unsigned'):tr('Вимкнено','Off')}</dd></div>
                  </dl> : <p className="form-hint">{tr('Метрики з’являться після першої збірки.','Metrics appear after the first build.')}</p>}
                </section>
                <section className="card">
                  <div className="rail-heading"><span>{tr('Клавіші','Shortcuts')}</span><Zap size={16}/></div>
                  <div className="shortcut-list">
                    <div className="shortcut-row"><span>{tr('Швидка збірка','Quick build')}</span><kbd>F5</kbd></div>
                    <div className="shortcut-row"><span>{tr('Віддалене розгортання','Remote deployment')}</span><kbd>F6</kbd></div>
                    <div className="shortcut-row"><span>{tr('Закрити діалог','Close dialog')}</span><kbd>Esc</kbd></div>
                  </div>
                </section>
              </aside>
            </div>
          </>}

          {project && page==='build' && <>
            <div className="build-toolbar">
              <button className="primary" disabled={busy} onClick={()=>void start('build')}><Package size={17}/>{tr('Лише зібрати пакет','Build package only')}</button>
              <button disabled={busy} onClick={()=>setWizard(0)}><SlidersHorizontal size={16}/>{tr('Майстер налаштування','Setup wizard')}</button>
              <button className="ghost" onClick={()=>openSettings(0)}><Settings2 size={16}/>{tr('Параметри збірки','Build settings')}</button>
            </div>
            <section className="card">
              <div className="build-hero-header">
                <div>
                  <h2>{tr('Конвеєр збірки','Build pipeline')}: {nameOf(project.root)}</h2>
                  <p>{tr('Папка мода','Mod folder')}: {String(settings.mod)} · {tr('Тестовий порт','Test port')}: {String(settings.port)}</p>
                </div>
                <Status tone={busy?'active':lastBuild?.status==='complete'?'good':lastBuild?'danger':'neutral'} dot>
                  {busy?stageText:lastBuild?lastBuild.status==='complete'?tr('Операцію завершено','Operation complete'):tr('Потрібна увага','Needs attention'):tr('Збірку ще не запускали','No build yet')}
                </Status>
              </div>
              <div className="metric-strip">
                <div className="metric"><dt>{tr('Час','Time')}</dt><dd>{lastBuild?lastBuild.seconds+' s':'-'}</dd></div>
                <div className="metric"><dt>PBO</dt><dd>{latestPackage?.count??'-'}</dd></div>
                <div className="metric"><dt>{tr('Попередження','Warnings')}</dt><dd className={lastBuild?.warnings?'warn':''}>{lastBuild?.warnings??'-'}</dd></div>
                <div className="metric"><dt>{tr('Підпис','Signature')}</dt><dd className={latestPackage?.signed?'good':''}>{latestPackage?.signed?tr('Перевірено','Verified'):settings.sign?'-':tr('Вимкнено','Disabled')}</dd></div>
              </div>
              <div className="pipeline" style={{ marginTop: 'var(--space-4)' }}>
                {[[tr('Підготовка й пакування PBO','Preflight and PBO packaging'),tr('Перевірка джерел і збірка AddonBuilder','Source checks and AddonBuilder')],
                  [tr('Цифровий підпис','Digital signature'),'DSSignFile · DSCheckSignatures'],
                  [tr('Розгортання в тестове середовище','Deploy to the test environment'),tr('Резервні копії, сервер і клієнт','Backups, server and client')],
                  [tr('Запуск і перевірка сервера','Start and verify the server'),tr('Місія й ігровий порт','Mission and game port')],
                  [tr('Запуск клієнта','Launch client'),tr('Опціональний запуск DayZ','Optional DayZ launch')]].map(([stageTitle,hint],index)=>{
                  const number=index+1
                  const verified=lastBuild&&[lastBuild.built,lastBuild.signed,lastBuild.installed,lastBuild.serverReady,lastBuild.clientLaunched][index]
                  const running=busy&&run?.stage===number
                  const disabled=number===2&&!settings.sign
                  const failure=!busy&&!verified&&lastBuild?.status==='failed'&&lastBuild.phase===number
                  const complete=!busy&&!disabled&&!!verified
                  const state = disabled?'skipped':running?'running':complete?'done':failure?'error':'pending'
                  const tone = state==='done'?'good':state==='running'?'active':state==='error'?'danger':'neutral'
                  const label = state==='done'?tr('Підтверджено','Verified'):state==='running'?tr('Виконується','Running'):
                    state==='error'?tr('Зупинилося тут','Stopped here'):state==='skipped'?tr('Вимкнено','Disabled'):tr('Очікує','Pending')
                  return <div className="pipeline-step" data-state={state} key={stageTitle}>
                    <span className="pipeline-marker">{state==='done'?<Check aria-hidden="true"/>:state==='error'?<X aria-hidden="true"/>:number}</span>
                    <div className="pipeline-copy"><strong>{stageTitle}</strong><small>{hint}</small></div>
                    <Status tone={tone}>{label}</Status>
                  </div>
                })}
              </div>
              {!!lastBuild?.error&&!busy&&<div className="alert" style={{ marginTop: 'var(--space-3)' }}><CircleAlert aria-hidden="true"/>
                <div className="alert-copy"><strong>{tr('Операцію зупинено','Operation stopped')}</strong><span>{lastBuild.error}</span></div>
                {project.details.retry&&<button className="btn-sm" onClick={()=>void start('retry')}>{tr('Продовжити','Resume')}</button>}</div>}
            </section>

            {!busy && selectedReport && operation(selectedReport)}

            <section className="card">
              <header className="card-header">
                <div className="card-header-copy">
                  <h2 className="card-title"><ClipboardList aria-hidden="true"/>{tr('Останні операції','Recent operations')}</h2>
                  <p className="card-description">{tr('Вибери запис, щоб переглянути деталі та журнал.','Select an entry to inspect details and the log.')}</p>
                </div>
              </header>
              <div className="list">
                {project.details.operations.length ? project.details.operations.map(item=>
                  <button className="list-item" key={item.date} onClick={()=>setSelectedReport(item)}>
                    <span className={'dot ' + (item.status==='complete'?'good':'danger')}/>
                    <span className="grow"><strong>{local(operationNames[item.action])}</strong>
                      <small>{new Date(item.date).toLocaleString(lng==='uk'?'uk-UA':'en-US')} · {item.seconds} {tr('с','s')} · {item.warnings} {tr('попереджень','warnings')}</small></span>
                    <Status tone={item.status==='complete'?'good':'danger'}>{item.status==='complete'?tr('Завершено','Complete'):tr('Помилка','Failed')}</Status>
                    <ChevronRight size={16} aria-hidden="true"/>
                  </button>) : <p className="form-hint">{tr('Операцій ще не було.','No operations yet.')}</p>}
              </div>
            </section>

            <section className="card command-card">
              <details className="terminal-commands">
                <summary><Terminal size={16}/>{tr('Команди PowerShell','PowerShell commands')}</summary>
                {(settingsDirty || !project.configured) &&
                  <small className="form-hint">{tr('Під час копіювання налаштування буде збережено для термінала.',
                    'Copying saves the current settings for the terminal.')}</small>}
                <div className="command-block">
                  <label>F5 · {tr('Зібрати та встановити','Build and deploy')}</label>
                  {commandLine('quick')}
                </div>
                <div className="command-block">
                  <label>F6 · {tr('Розгорнути вибрану збірку','Deploy selected build')}</label>
                  {project.details.commands.remote ? commandLine('remote') :
                    <small className="form-hint">{tr('Команда з’явиться після підготовки збірки для вибраного джерела.',
                      'The command appears when a build is ready for the selected source.')}</small>}
                </div>
                <div className="command-block">
                  <label>{tr('Інша дія','Other action')}</label>
                  <select value={terminalAction} onChange={event=>setTerminalAction(event.target.value)}>
                    {Object.keys(project.details.commands).filter(action=>action!=='quick'&&action!=='remote').map(action=>
                      <option key={action} value={action}>{action}</option>)}
                  </select>
                  {commandLine(terminalAction)}
                </div>
              </details>
            </section>

            <section className="card">
              <header className="card-header">
                <div className="card-header-copy">
                  <h2 className="card-title"><HardDrive aria-hidden="true"/>{tr('Історія збірок','Build history')}</h2>
                  <p className="card-description">{tr('Збережені пакети у папці збірки.','Stored packages in the build folder.')}</p>
                </div>
                <div className="card-actions"><span className="badge">{project.details.builds.length}</span></div>
              </header>
              <div className="list">
                {project.details.builds.map(build=><button key={build.path} className="list-item" onClick={()=>void reveal(build.path)}>
                  <Package size={16} aria-hidden="true"/>
                  <span className="grow"><strong>{build.name}</strong><small>{build.count} PBO · {build.signed?tr('Підписано','Signed'):tr('Без підпису','Unsigned')}</small></span>
                  <FolderOpen size={16} aria-hidden="true"/>
                </button>)}
                {!project.details.builds.length && <p className="form-hint">{tr('Збірок ще немає.','No builds yet.')}</p>}
              </div>
            </section>
          </>}

          {project && page==='server' && <>
            <div className="server-layout">
              <div className="server-main">
                {!busy && selectedReport && operation(selectedReport)}

                <section className="card">
                  <header className="card-header">
                    <div className="card-header-copy">
                      <h2 className="card-title"><ShieldCheck aria-hidden="true"/>{tr('Готовність до тесту','Test readiness')}</h2>
                      <p className="card-description">{tr('Кожен пункт має конкретну дію для виправлення.','Every item has a concrete fix action.')}</p>
                    </div>
                    <div className="card-actions">
                      <Status tone={ready?'good':'warn'}>{ready?tr('Середовище готове','Environment ready'):tr('Потрібна увага','Needs attention')}</Status>
                    </div>
                  </header>
                  {readinessRows()}
                </section>

                <section className="card">
                  <header className="card-header">
                    <div className="card-header-copy">
                      <h2 className="card-title"><Play aria-hidden="true"/>{tr('Локальне тестування','Local testing')}</h2>
                      <p className="card-description">{tr('Збери мод і запусти локальний сервер та клієнт.','Build the mod and launch the local server and client.')}</p>
                    </div>
                    <div className="card-actions">
                      <Status tone={live==='ready'?'good':'neutral'} dot>{serverState}</Status>
                    </div>
                  </header>
                  <div className="action-bar">
                    <button className="primary" disabled={busy} onClick={()=>void start('test')}><Play size={17}/>{tr('Зібрати та протестувати','Build and test')}</button>
                    <button disabled={busy||!ready||!project.details.packageReady} onClick={()=>void start('deploy')}><CloudUpload size={16}/>{tr('Лише встановити пакет','Install package only')}</button>
                    <button disabled={busy||!ready||!project.details.deployment} onClick={()=>void start('launch')}><Power size={16}/>{tr('Запустити встановлене','Launch installed')}</button>
                    <button className="ghost" disabled={busy||!project.details.retry} onClick={()=>void start('retry')}><RotateCcw size={16}/>{tr('Продовжити тест','Resume test')}</button>
                  </div>
                  <div className="session-strip">
                    <div className="session-cell"><span>{tr('Сесія','Session')}</span><strong>{live==='ready'?tr('Сервер слухає порт','Server is listening'):live==='offline'?tr('Сервер зупинено','Server stopped'):tr('Стан невідомий','Unknown state')}</strong></div>
                    <div className="session-cell"><span>{tr('Порт','Port')}</span><strong>{String(settings.port || tr('Типове значення','Default'))}</strong></div>
                    <div className="session-cell"><span>{tr('Профіль','Profile')}</span><strong title={String(settings.profiles || '')}>{nameOf(String(settings.profiles || tr('Типовий','Default')))}</strong></div>
                  </div>
                  <div className="row" style={{ marginTop: 'var(--space-3)' }}>
                    <button className="btn-sm ghost" onClick={()=>openSettings(1)}><Settings2 size={15}/>{tr('Налаштування тесту','Test settings')}</button>
                  </div>
                </section>

                <section className="card">
                  <header className="card-header">
                    <div className="card-header-copy">
                      <h2 className="card-title"><Network aria-hidden="true"/>{tr('Віддалене розгортання','Remote deployment')}</h2>
                      <p className="card-description">{tr('SSH/SFTP для виділеного сервера.','SSH/SFTP for a dedicated server.')}</p>
                    </div>
                    <div className="card-actions">
                      <Status tone={settings.remote_host?'info':'warn'} dot>{settings.remote_host?tr('Налаштовано','Configured'):tr('Не налаштовано','Not configured')}</Status>
                    </div>
                  </header>
                  <div className="remote-summary">
                    <div className="remote-summary-row"><span>{tr('Сервер','Host')}</span><code title={String(settings.remote_host || '')}>{String(settings.remote_host || tr('Не вказано','Not set'))}</code></div>
                    <div className="remote-summary-row"><span>{tr('Збірка','Build')}</span><code title={project.details.remoteChoice.buildId}>{project.details.remoteChoice.buildId || tr('Немає готової збірки','No ready build')}</code></div>
                    <div className="remote-summary-row"><span>{tr('Режим','Mode')}</span><strong>{settings.remote_files_only?tr('Лише SFTP','SFTP only'):tr('SSH + SFTP','SSH + SFTP')}</strong></div>
                    {project.details.remoteChoice.changed && <div className="remote-summary-row"><span>{tr('Джерела','Sources')}</span><strong className="warning">{tr('Є новіші зміни','Newer changes available')}</strong></div>}
                  </div>
                  {settings.remote_host ? <div className="action-bar">
                    <button className="primary" disabled={busy || !project.details.remoteChoice.buildId} onClick={()=>void start('remote')}>
                      <CloudUpload size={17}/>{settings.remote_files_only ? tr('Завантажити через SFTP','Upload over SFTP') : tr('Розгорнути через SSH','Deploy over SSH')} <kbd>F6</kbd></button>
                    <button disabled={busy} onClick={()=>void start('remote-check')}><Wifi size={16}/>{tr('Перевірити підключення','Check connection')}</button>
                    <button className="ghost" onClick={()=>openSettings(5)}><Settings2 size={16}/>{tr('Налаштування SSH/SFTP','SSH/SFTP settings')}</button>
                  </div> : <EmptyState icon={<Network size={22}/>} title={tr('Віддалений сервер не налаштовано','Remote server is not configured')}
                    description={tr('Додай адресу SSH, користувача та папки DayZ, щоб розгортати збірку на сервер.',
                      'Add an SSH host, user and DayZ folders to deploy builds to the server.')}
                    actions={<button className="primary" onClick={()=>openSettings(5)}><Settings2 size={16}/>{tr('Налаштувати SSH/SFTP','Configure SSH/SFTP')}</button>}/>}
                </section>

                <section className="card card-danger">
                  <header className="card-header">
                    <div className="card-header-copy">
                      <h2 className="card-title"><CircleAlert aria-hidden="true"/>{tr('Розширені дії','Advanced controls')}</h2>
                      <p className="card-description">{tr('Керування процесами та діагностика. Дії нижче впливають на запущену сесію.',
                        'Process control and diagnostics. These actions affect the running session.')}</p>
                    </div>
                  </header>
                  <div className="danger-actions">
                    <button disabled={busy} onClick={()=>void stopSession(false)}><Power size={16}/>{tr('Зупинити сесію','Stop session')}</button>
                    <button className="danger" disabled={busy} onClick={()=>setForceConfirm(true)}><CircleAlert size={16}/>{tr('Примусово завершити','Force stop')}</button>
                    <button className="ghost" disabled={!entries.length} onClick={()=>setShowLog(true)}><Bug size={16}/>{tr('Відкрити діагностику','Open diagnostics')}</button>
                  </div>
                </section>
              </div>

              <aside className="server-rail">
                <section className="card">
                  <div className="rail-heading"><span>{tr('Активний профіль','Active profile')}</span><Status tone={live==='ready'?'good':'neutral'} dot>{serverState}</Status></div>
                  <div className="data-list">
                    {['config','profiles','client_profiles','port'].map(key=><div className="data-row" key={key}>
                      <span className="dim">{tr(fields[key][0],fields[key][1])}</span>
                      <span className="grow"/>
                      <strong title={String(settings[key] || '')} style={{ maxWidth: '58%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {String(settings[key] || tr('Типове значення','Default'))}</strong>
                    </div>)}
                  </div>
                </section>
                <section className="card">
                  <div className="rail-heading"><span>{tr('Резервні копії','Backups')}</span><HardDrive size={16}/></div>
                  <button className="btn-block" disabled={busy||!project.details.rollback} onClick={()=>setConfirmation('rollback')}>
                    <RotateCcw size={16}/>{tr('Відновити попереднє встановлення','Restore previous installation')}</button>
                  {!project.details.backups.length&&<p className="form-hint" style={{ marginTop: 'var(--space-2)' }}>{tr('Копії з’являться після першого локального встановлення.','Backups appear after the first local deployment.')}</p>}
                  {!!project.details.backups.length && <div className="list" style={{ marginTop: 'var(--space-2)' }}>
                    {project.details.backups.map(path=><button className="list-item" key={path} onClick={()=>void reveal(path)}>
                      <HardDrive size={15}/><span className="grow"><strong>{nameOf(path)}</strong><small>{path}</small></span></button>)}
                  </div>}
                </section>
              </aside>
            </div>
          </>}

          {project && page==='workshop' && <>
            {!busy && selectedReport && operation(selectedReport)}
            <section className="card">
              <div className="workshop-hero">
                <div>
                  <h2>Workshop · {(checkedItem?.input === settings.workshop && checkedItem?.title) || String(settings.workshop_title || settings.workshop || '-')}</h2>
                  <p>{project.details.published.buildId ? tr('Остання підтверджена публікація','Last confirmed publication') + ' · ' + project.details.published.buildId : tr('Публікацію ще не підтверджено','Awaiting confirmed publication')}</p>
                </div>
                <Status tone={project.details.published.buildId?'good':'neutral'} dot>
                  {project.details.published.buildId?tr('Опубліковано','Published'):tr('Чернетка','Draft')}
                </Status>
              </div>
              <div className="action-bar">
                <button className="primary" disabled={busy||!project.details.localBuild.buildId||project.details.sourcesChanged!==false||!settings.workshop} onClick={()=>setConfirmation('publish')}>
                  <CloudUpload size={17}/>{tr('Опублікувати перевірену збірку','Publish tested build')}</button>
                {project.details.publication.status === 'failed' && <button disabled={busy} onClick={()=>void start('retry-publish')}><RotateCcw size={16}/>{tr('Повторити публікацію','Retry publication')}</button>}
                {['pending','uncertain'].includes(project.details.publication.status || '') && <Status tone="warn">{tr('Перевір результат у Steam','Check the result in Steam')}</Status>}
                <button className="ghost" onClick={()=>openSettings(4)}><Settings2 size={16}/>{tr('Налаштування Workshop','Workshop settings')}</button>
              </div>
              <div className="metric-strip" style={{ marginTop: 'var(--space-4)' }}>
                <div className="metric"><dt>{tr('Локальна збірка','Local build')}</dt><dd>{project.details.localBuild.buildId || '-'}</dd></div>
                <div className="metric"><dt>{tr('Джерела','Sources')}</dt><dd className={project.details.sourcesChanged?'warn':'good'}>{project.details.sourcesChanged?tr('Є зміни','Changed'):tr('Актуальні','Up to date')}</dd></div>
                <div className="metric"><dt>Item</dt><dd>{settings.workshop?String(settings.workshop):'-'}</dd></div>
              </div>
            </section>
            {(!settings.workshop || project.details.workshopDraft.status) && <section className="card">
              <header className="card-header">
                <div className="card-header-copy">
                  <h2 className="card-title"><Plus aria-hidden="true"/>{tr('Новий item Workshop','New Workshop item')}</h2>
                  <p className="card-description">{tr('Заповни назву, опис і обкладинку для першої публікації.','Fill in the title, description and cover for the first publication.')}</p>
                </div>
              </header>
              <fieldset disabled={busy}>
                {form(['workshop_title','workshop_description','workshop_preview','workshop_visibility'])}
                <div className="row" style={{ marginTop: 'var(--space-4)' }}>
                  <button className="primary" disabled={project.details.sourcesChanged !== false || !settings.steam_owner
                    || (!!project.details.workshopDraft.status && !project.details.workshopDraft.item && !settings.workshop)} onClick={()=>setConfirmation('create-workshop')}>
                    <CloudUpload size={17}/>{project.details.workshopDraft.status ? tr('Завершити першу публікацію','Finish first publication') : tr('Створити item і опублікувати','Create and publish item')}
                  </button>
                  <button className="ghost" onClick={()=>openSettings(4)}><KeyRound size={16}/>{tr('SteamID64 і перевірка item','SteamID64 and item check')}</button>
                </div>
                {project.details.workshopDraft.status && !project.details.workshopDraft.item &&
                  <p className="form-hint" style={{ marginTop: 'var(--space-2)' }}>{tr('Перевір у Steam, чи створено item, і збережи його ID в налаштуваннях.','Check Steam for the created item and save its ID in settings.')}</p>}
              </fieldset>
            </section>}
          </>}

          {page==='settings' && <>
            <div className="settings-layout">
              <nav className="settings-nav" aria-label={tr('Групи налаштувань','Settings groups')}>
                {settingsTabs.map((tab,index)=>{
                  const Icon = settingIcons[index]
                  return <button key={index} className="settings-tab" aria-pressed={settingsGroup===index} onClick={()=>setSettingsGroup(index)}>
                    <Icon aria-hidden="true"/><span>{local(tab.title)}</span>
                  </button>
                })}
              </nav>
              <section className="card settings-panel">
                <header className="card-header">
                  <div className="card-header-copy">
                    <h2 className="card-title">{local(settingsTabs[settingsGroup].title)}</h2>
                    <p className="card-description">{settingsTabs[settingsGroup].description}</p>
                  </div>
                  <div className="card-actions">
                    {settingsDirty && <span className="badge warn">{tr('Є незбережені зміни','Unsaved changes')}</span>}
                    {project&&<button className="primary" disabled={busy || !settingsDirty} onClick={()=>void saveSettings()}><Check size={17}/>{tr('Зберегти','Save')}</button>}
                  </div>
                </header>
                {project&&<fieldset disabled={busy}>
                  {settingsGroup===2 ? dependencies() : (()=>{
                    const group=groups[settingsGroup>2?settingsGroup-1:settingsGroup]
                    const keys=group.basic.filter(key=>key!=='base' && !(settings.remote_files_only && ['remote_keys','remote_service','remote_readiness'].includes(key)))
                    if (settingsGroup===0) return <>{addonEditor()}{advanced && <div style={{ marginTop: 'var(--space-5)' }}>{form(group.advanced)}</div>}</>
                    return form(advanced?[...keys,...group.advanced]:keys)
                  })()}
                  <div className="settings-footer">
                    <label className="form-check"><input type="checkbox" checked={advanced} onChange={e=>setAdvanced(e.target.checked)}/>{tr('Розширені параметри','Advanced settings')}</label>
                    <div className="row">
                      {settingsGroup===1&&<button onClick={()=>void detect()}><RefreshCw size={16}/>{tr('Знайти DayZ','Detect DayZ')}</button>}
                      {settingsGroup===3&&<>
                        <input aria-label={tr('Назва нової пари ключів','New key pair name')} placeholder={tr('Назва нової пари ключів','New key pair name')}
                          value={keyName} onChange={e=>setKeyName(e.target.value)} style={{ width: 200 }}/>
                        <button disabled={!keyName.trim()} onClick={()=>void generateKeys()}><KeyRound size={16}/>{tr('Створити пару ключів','Generate key pair')}</button>
                      </>}
                      {settingsGroup===4&&<>
                        <button onClick={()=>void steamOwner()}><RefreshCw size={16}/>{tr('Визначити SteamID64','Get active SteamID64')}</button>
                        <button disabled={!settings.workshop} onClick={()=>void checkWorkshop()}><ShieldCheck size={16}/>{tr('Перевірити item','Check item')}</button>
                        {checkedItem?.input===settings.workshop&&checkedItem?.title&&<span className="badge success">{checkedItem.title}</span>}
                      </>}
                      {settingsGroup===5&&<button disabled={busy} onClick={()=>void start('remote-check')}><Wifi size={16}/>{tr('Перевірити підключення','Check connection')}</button>}
                    </div>
                  </div>
                  {settingsGroup===4&&commandLine('workshop-check')}
                  {settingsGroup===5&&commandLine('remote-check')}
                </fieldset>}
                {!project&&<EmptyState icon={<Box size={22}/>} title={tr('Проєкт не вибрано','No project selected')}
                  description={tr('Налаштування зберігаються у проєкті. Відкрий папку, щоб редагувати параметри.',
                    'Settings are stored per project. Open a folder to edit them.')}
                  actions={<button className="primary" onClick={()=>void chooseProject()}><FolderOpen size={16}/>{tr('Відкрити проєкт','Open project')}</button>}/>}
              </section>
            </div>
          </>}
        </div>
      </main>

      {!toolPage && <LogDrawer open={showLog} toggle={()=>setShowLog(false)} entries={entries} logs={project?.details.logs||[]} busy={busy} read={path=>void readLog(path)} tr={tr}/>}

      <footer className="statusbar">
        <span className="status-text" aria-live="polite">{showModels ? modelStatus : showTextures ? textureStatus : stageText}</span>
        {!toolPage&&busy&&<progress aria-label={tr('Прогрес операції','Operation progress')} max={5} value={run?.stage??0}/>}
        <span className="spacer"/>
        {project && <span className="status-text dim">{project.configured ? tr('Проєкт налаштовано','Project configured') : tr('Проєкт не налаштовано','Project not configured')}</span>}
        {!toolPage && <button className="ghost btn-sm" aria-expanded={showLog} onClick={()=>setShowLog(!showLog)}><Terminal size={15}/>{tr('Деталі','Details')}</button>}
      </footer>
    </div>

    {wizard !== undefined && <Dialog title={setupSteps[wizard]} description={`${wizard + 1} / ${setupSteps.length}`}
      label={tr('Майстер налаштування','Setup wizard')} onClose={()=>{setWizard(undefined);setNotice('')}}
      footer={<>
        <button onClick={()=>{setWizard(undefined);setNotice('')}}>{tr('Закрити','Close')}</button>
        <span className="spacer"/>
        {wizard>0 && <button disabled={busy} onClick={()=>{setWizard(wizard-1);setNotice('')}}>{tr('Назад','Back')}</button>}
        {wizard<2 ? <button className="primary" disabled={busy || !project || !addonFolders(settings).length}
          onClick={()=>{setWizard(wizard+1);setNotice('')}}>{tr('Далі','Next')}<ChevronRight size={16}/></button> :
          <button className="primary" disabled={busy} onClick={()=>void saveSettings(true)}><Check size={16}/>{tr('Зберегти проєкт','Save project')}</button>}
      </>}>
      <div className="wizard-steps">
        {setupSteps.map((step,index)=><span key={step} style={{ display: 'contents' }}>
          <span className="wizard-step" data-state={index===wizard?'current':index<wizard?'done':'pending'}>
            <span className="step-dot">{index<wizard?'✓':index+1}</span>{step}
          </span>
          {index<setupSteps.length-1 && <span className="wizard-divider"/>}
        </span>)}
      </div>
      <fieldset disabled={busy}>
        {wizard === 0 && <>
          <div className="form-field" style={{ marginBottom: 'var(--space-3)' }}>
            <label>{tr('Папка вихідних файлів','Source folder')}</label>
            <div className="field-row">
              <input readOnly value={project?.root ?? ''} title={project?.root}/>
              <button onClick={()=>void chooseProject()}><FolderOpen size={16}/>{tr('Вибрати папку','Choose folder')}</button>
            </div>
          </div>
          {project && addonEditor()}
        </>}
        {wizard === 1 && <>
          {form(['tools', 'addon_builder', 'copy_server', 'copy_client', ...(settings.copy_server ? ['server'] : []), ...(settings.copy_client ? ['client'] : [])])}
          <div className="row" style={{ marginTop: 'var(--space-3)' }}>
            <button onClick={()=>void detect()}><RefreshCw size={16}/>{tr('Знайти DayZ та AddonBuilder','Detect DayZ and AddonBuilder')}</button>
          </div>
        </>}
        {wizard === 2 && <>
          {form(settings.sign ? ['sign', 'private', 'public'] : ['sign'])}
          {settings.sign && <div className="row" style={{ marginTop: 'var(--space-3)' }}>
            <input aria-label={tr('Назва пари ключів','Key pair name')} placeholder={tr('Назва пари ключів','Key pair name')}
              value={keyName} onChange={event=>setKeyName(event.target.value)} style={{ maxWidth: 260 }}/>
            <button disabled={!keyName.trim()} onClick={()=>void generateKeys()}><KeyRound size={16}/>{tr('Створити пару ключів','Generate key pair')}</button>
          </div>}
        </>}
        {notice && <Notice tone={noticeTone}>{notice}</Notice>}
      </fieldset>
    </Dialog>}

    {confirmation && <Dialog title={local(operationNames[confirmation])} width="sm"
      description={confirmation==='publish'? 'Workshop · '+String(settings.workshop) + ' · ' + project?.details.localBuild.buildId
        : confirmation==='create-workshop' ? String(settings.workshop_title || '') + ' · ' + (project?.details.localBuild.buildId || '')
        : tr('Відновити файли з попереднього встановлення?','Restore the files from the previous installation?')}
      label={tr('Підтвердження','Confirmation')} onClose={()=>setConfirmation(undefined)}
      footer={<>
        <button onClick={()=>setConfirmation(undefined)}>{tr('Скасувати','Cancel')}</button>
        <button className="primary" data-autofocus onClick={()=>confirmation&&void start(confirmation)}>{tr('Підтвердити','Confirm')}</button>
      </>}>
      <div className={'alert ' + (confirmation==='rollback'?'warn':'info')}><CircleAlert aria-hidden="true"/>
        <div className="alert-copy">{confirmation==='rollback'
          ? tr('Поточні файли буде замінено резервною копією. Переконайся, що сервер зупинено.',
              'Current files will be replaced by the backup. Make sure the server is stopped.')
          : tr('Дію буде виконано для активної збірки проєкту.','The action will run for the active project build.')}</div>
      </div>
    </Dialog>}

    {forceConfirm && <Dialog title={tr('Примусово завершити сервер?','Force stop the server?')} width="sm"
      label={tr('Підтвердження','Confirmation')} onClose={()=>setForceConfirm(false)}
      description={tr('Ця дія небезпечна для запущеної сесії.','This action is disruptive to the running session.')}
      footer={<>
        <button onClick={()=>setForceConfirm(false)}>{tr('Скасувати','Cancel')}</button>
        <button className="danger-solid" onClick={()=>{setForceConfirm(false);void stopSession(true)}}>{tr('Завершити процес','Stop process')}</button>
      </>}>
      <div className="alert"><CircleAlert aria-hidden="true"/><div className="alert-copy">
        {tr('Не збережений прогрес тестової сесії може втратитися. Використовуй цю дію, лише якщо звичайна зупинка не спрацювала.',
          'Unsaved progress in the test session may be lost. Use this only when a normal stop did not work.')}
      </div></div>
    </Dialog>}
  </div>
}
createRoot(document.getElementById('root')!).render(<App/>)
