import { Command, type Child } from '@tauri-apps/plugin-shell'
export type Settings = Record<string, string | boolean>
export type Check = { key: string; ok: boolean; detail: string }
export type Operation = { action: string; date: string; phase: number; status: 'failed' | 'complete'; warnings: number; seconds: number; built: boolean; signed: boolean; installed: boolean; serverReady: boolean; clientLaunched: boolean; connected: boolean; updated: string[]; files: string[]; log: string; error?: string; attention?: boolean; buildId?: string; workshopStatus?: string; clientError?: string; next?: {action: string; buildId?: string}; remote?: { status: string; staging: string } }
export type Destination = { buildId?: string; date?: string; status?: string; item?: string; changed?: boolean }
export type Details = { commands: Record<string, string>; publication: Destination; published: Destination; workshopDraft: Destination; workshopItem: string; localBuild: Destination; remoteBuild: Destination; remoteChoice: Destination; sourcesChanged: boolean | null; operations: Operation[]; packageReady: boolean; deployment: boolean; retry: boolean; checks: Check[]; dependencies: string[]; dependencyState: {entry: string; kind: string; order: number; available: boolean; path?: string; error?: string}[]; builds: { name: string; path: string; signed: boolean; tested: boolean; count: number }[]; backups: string[]; logs: string[]; rollback: boolean; tested: boolean }
export type Project = { root: string; configured: boolean; settings: Settings; details: Details }
export type RunResult = Details & { currentOperation: Operation }
export type Message = { event: string; id: number; stage?: number; label?: string | [string, string]; text?: string; value?: unknown }
type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void; event?: (message: Message) => void }
let process: Promise<Child> | undefined
let sequence = 0
const pending = new Map<number, Pending>()

function launch() {
  const command = Command.sidecar('binaries/dayz-backend', [], { encoding: 'raw' })
  const decoder = new TextDecoder()
  let buffer = ''
  const disconnect = (reason: string) => {
    for (const request of pending.values()) request.reject(new Error(reason))
    pending.clear()
    process = undefined
  }
  command.on('close', ({code}) => disconnect('DayZ backend exited (' + code + ')'))
  command.on('error', disconnect)
  command.stdout.on('data', (data) => {
    buffer += typeof data === 'string' ? data : decoder.decode(Uint8Array.from(data), {stream: true})
    let newline = buffer.indexOf('\n')
    while (newline >= 0) {
      const line = buffer.slice(0, newline)
      buffer = buffer.slice(newline + 1)
      newline = buffer.indexOf('\n')
      try {
        const message: Message = JSON.parse(line)
        const request = pending.get(message.id)
        if (!request) continue
        if (message.event === 'result' || message.event === 'error') {
          pending.delete(message.id)
          if (message.event === 'error') request.reject(new Error(message.text))
          else request.resolve(message.value)
        } else request.event?.(message)
      } catch (error) {
        console.error(error)
      }
    }
  })
  return command.spawn().catch(error => { process = undefined; throw error })
}

const previewRoot = 'C:\\DayZ\\Projects\\MyMod'
const previewSettings: Record<string, string | boolean> = {
  addons: 'addons\\core\naddons\\weapons', mod: 'C:\\DayZ\\@MyMod',
  tools: 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\DayZ Tools',
  server: 'C:\\DayZServer', client: 'C:\\DayZ', config: 'C:\\DayZServer\\serverDZ.cfg',
  profiles: 'C:\\DayZServer\\profiles', client_profiles: 'C:\\DayZ\\profiles', port: '2302',
  sign: true, copy_server: true, copy_client: true,
  private: 'C:\\DayZ\\Keys\\MyMod.biprivatekey', public: 'C:\\DayZ\\Keys\\MyMod.bikey',
  workshop: '1234567890', workshop_title: 'My Weapon Pack', workshop_description: 'A compact weapon pack for testing.',
  workshop_visibility: 'public', steam_owner: '76561198000000000',
  remote_host: 'dayz.example.com', remote_port: '22', remote_user: 'dayz',
  remote_root: '/srv/dayz', remote_mod: '/srv/dayz/@MyMod', remote_keys: '/srv/dayz/keys',
  remote_files_only: false, open_dayz: true, publish_workshop: true,
}
const previewOperation = {
  action: 'quick', date: '2026-11-22T10:15:00.000Z', phase: 3, status: 'complete' as const, warnings: 2, seconds: 38,
  built: true, signed: true, installed: true, serverReady: true, clientLaunched: true, connected: true,
  updated: ['C:\\DayZ\\@MyMod\\Addons', 'C:\\DayZ\\@MyMod\\Keys'], files: ['Addons/mycore.pbo', 'Addons/myweapons.pbo'],
  log: 'C:\\DayZServer\\profiles\\logs\\quick.log', buildId: '20261122-101500-a1b2c3d4',
}
const previewDetails = {
  commands: {
    quick: '.\\dayz-backend.exe --project "C:\\DayZ\\Projects\\MyMod" quick',
    remote: '.\\dayz-backend.exe --project "C:\\DayZ\\Projects\\MyMod" remote --build-id 20261122-101500-a1b2c3d4',
    build: '.\\dayz-backend.exe --project "C:\\DayZ\\Projects\\MyMod" build',
    'workshop-check': '.\\dayz-backend.exe --project "C:\\DayZ\\Projects\\MyMod" workshop-check',
    'remote-check': '.\\dayz-backend.exe --project "C:\\DayZ\\Projects\\MyMod" remote-check',
    status: '.\\dayz-backend.exe --project "C:\\DayZ\\Projects\\MyMod" status',
  },
  publication: { status: 'complete' }, published: { buildId: '20261122-101500-a1b2c3d4' },
  workshopDraft: {}, workshopItem: '1234567890', localBuild: { buildId: '20261122-101500-a1b2c3d4' },
  remoteBuild: { buildId: '20261122-101500-a1b2c3d4' }, remoteChoice: { buildId: '20261122-101500-a1b2c3d4', changed: false },
  sourcesChanged: false, packageReady: true, deployment: true, retry: false,
  checks: [
    { key: 'project', ok: true, detail: 'config.cpp і $PBOPREFIX$ знайдено' },
    { key: 'sources', ok: true, detail: '2 аддони, 148 файлів' },
    { key: 'tools', ok: true, detail: 'AddonBuilder і DSSignFile доступні' },
    { key: 'environment', ok: true, detail: 'Сервер і клієнт знайдені, порт 2302 вільний' },
    { key: 'signing', ok: true, detail: 'MyMod.bikey відповідає приватному ключу' },
  ],
  operations: [
    previewOperation,
    { ...previewOperation, action: 'test', date: '2026-11-22T09:58:00.000Z', seconds: 74, warnings: 0 },
    { ...previewOperation, action: 'build', date: '2026-11-21T18:22:00.000Z', status: 'failed' as const, phase: 2, seconds: 12,
      built: true, signed: false, installed: false, serverReady: false, clientLaunched: false, connected: false, error: 'DSSignFile: private key not found' },
  ],
  dependencies: ['DZ_Data', 'MyCore'],
  dependencyState: [{ entry: 'C:\\DayZ\\Mods\\MyCore', kind: 'base', order: 1, available: true, path: 'C:\\DayZ\\Mods\\MyCore' }],
  builds: [
    { name: '20261122-101500-a1b2c3d4', path: 'C:\\DayZ\\@MyMod\\builds\\20261122-101500-a1b2c3d4', signed: true, tested: true, count: 4 },
    { name: '20261121-182200-b2c3d4e5', path: 'C:\\DayZ\\@MyMod\\builds\\20261121-182200-b2c3d4e5', signed: false, tested: false, count: 4 },
  ],
  backups: ['C:\\DayZServer\\backup\\20261122-101500', 'C:\\DayZServer\\backup\\20261121-182200'],
  logs: ['C:\\DayZServer\\profiles\\logs\\quick.log', 'C:\\DayZServer\\profiles\\logs\\test.log'],
  rollback: true, tested: true,
}
const previewProject = { root: previewRoot, configured: true, settings: previewSettings, details: previewDetails }
const previewLog = [
  '[10:15:02] AddonBuilder 1.0 — packaging mycore',
  '[10:15:05] config.cpp parsed, 148 files',
  '[10:15:11] PBO created: Addons/mycore.pbo',
  '[10:15:14] DSSignFile: signature created',
  '[10:15:18] DSCheckSignatures: 2 PBO verified',
  '[10:15:24] Copied to C:\\DayZ\\@MyMod\\Addons',
  '[10:15:31] Copied to C:\\DayZServer\\@MyMod',
  '[10:15:38] Quick build complete',
].join('\n')

async function previewCall<T>(command: string, input: Record<string, unknown>, lang: string): Promise<T> {
  if (command === 'hello') return { interface: { language: lang, theme: 'dark', projects: [] }, workspace: previewRoot, recent: null } as T
  if (command === 'open' || command === 'snapshot') return previewProject as T
  if (command === 'details' || command === 'save' || command === 'saveQuick') return previewDetails as T
  if (command === 'addonInfo') return [
    { path: 'addons\\core', name: 'mycore', prefix: 'mycore', declared: 'mycore' },
    { path: 'addons\\weapons', name: 'myweapons', prefix: 'myweapons', declared: '' },
  ] as T
  if (command === 'readLog') return previewLog as T
  if (command === 'serverStatus') return 'ready' as T
  if (command === 'exportFolder') return 'C:\\DayZ\\output\\models' as T
  if (command === 'preferences') return undefined as T
  if (command === 'run') {
    const action = String(input.action || 'quick')
    const stage = Number(input.action === 'remote' ? 3 : 1)
    return { ...previewDetails, currentOperation: { ...previewOperation, action, phase: stage } } as T
  }
  return {} as T
}

export async function call<T>(language: string, command: string, input = {}, event?: Pending['event']): Promise<T> {
  if (import.meta.env.DEV && !('__TAURI_INTERNALS__' in window)) {
    return previewCall<T>(command, input as Record<string, unknown>, language)
  }
  const child = await (process ??= launch())
  const id = ++sequence
  return new Promise<T>((resolve, reject) => {
    pending.set(id, {resolve: value => resolve(value as T), reject, event})
    child.write(JSON.stringify({id, command, language, ...input}) + '\n').catch(error => {
      pending.delete(id)
      reject(error)
    })
  })
}
