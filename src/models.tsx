import { useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { Box, FolderOpen, Upload } from 'lucide-react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { call, type Settings } from './backend'
import type { Lang } from './locale'
import { OutputFolder, useExportFolder } from './export-folder'

type ModelFiles = { folder: string; model: string; texture: string; prefix: string; validation: {
  lods: {resolution: number; vertices: number; triangles: number; removedVertices: number}[];
  uv: boolean; materials: number; collision: boolean
} }

type P3dLod = {
  resolution: number; vertices: number; faces: number; triangles: number
  positions: string; indices: string
}

// Object Builder stores the LOD kind in the float32 resolution field.
const lodNames: Partial<Record<number, string>> = {
  1000: 'View Gunner', 1100: 'View Pilot', 1200: 'View Cargo',
  1e13: 'Geometry', 4e13: 'Geometry PhysX',
  1e15: 'Memory', 2e15: 'Land Contact', 3e15: 'Roadway', 4e15: 'Paths',
  5e15: 'Hit-points', 6e15: 'View Geometry', 7e15: 'Fire Geometry',
}

function lodLabel(value: number) {
  const resolution = Number(value.toPrecision(7))
  if (resolution >= 10000 && resolution <= 10999) return `Shadow Volume ${resolution - 10000}`
  return lodNames[resolution] ?? resolution.toString()
}

function decode(data: string) {
  const binary = atob(data)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
  return bytes.buffer
}

async function loadPreview(data: string | P3dLod) {
  if (typeof data === 'string') return (await new GLTFLoader().parseAsync(decode(data), '')).scene
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(decode(data.positions)), 3))
  if (!data.triangles) {
    return new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0x83beed, size: 5, sizeAttenuation: false }))
  }
  geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(decode(data.indices)), 1))
  geometry.computeVertexNormals()
  return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0x8babc4, side: THREE.DoubleSide }))
}

function Preview({ data, fallback }: { data: string | P3dLod; fallback: string }) {
  const mount = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    const host = mount.current
    if (!host) return
    setFailed(false)
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    } catch {
      setFailed(true)
      return
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    host.append(renderer.domElement)
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(36, 1, .01, 10000)
    const controls = new OrbitControls(camera, renderer.domElement)
    scene.add(new THREE.HemisphereLight(0xffffff, 0x7a8290, 2.5))
    const key = new THREE.DirectionalLight(0xffffff, 2)
    key.position.set(3, 4, 2)
    scene.add(key)
    const draw = () => renderer.render(scene, camera)
    controls.addEventListener('change', draw)
    let active = true
    let model: THREE.Object3D | undefined
    let framed = false
    const resize = () => {
      const { clientWidth: width, clientHeight: height } = host
      if (!width || !height) return
      renderer.setSize(width, height)
      camera.aspect = width / height
      if (model && !framed) {
        const bounds = new THREE.Box3().setFromObject(model)
        const center = bounds.getCenter(new THREE.Vector3())
        const radius = bounds.getBoundingSphere(new THREE.Sphere()).radius || 1
        camera.near = radius / 100
        camera.far = radius * 100
        const vertical = THREE.MathUtils.degToRad(camera.fov / 2)
        const horizontal = Math.atan(Math.tan(vertical) * camera.aspect)
        const distance = radius / Math.sin(Math.min(horizontal, vertical)) * 1.15
        camera.position.copy(center).addScaledVector(new THREE.Vector3(1, .55, 1.5).normalize(), distance)
        controls.target.copy(center)
        framed = true
      }
      camera.updateProjectionMatrix()
      controls.update()
      draw()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(host)
    function dispose(object: THREE.Object3D) {
      object.traverse(node => {
        if (!(node instanceof THREE.Mesh || node instanceof THREE.Points)) return
        node.geometry.dispose()
        for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
          for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.dispose()
          material.dispose()
        }
      })
    }
    void loadPreview(data).then(object => {
      if (!active) {
        dispose(object)
        return
      }
      model = object
      scene.add(model)
      resize()
    }).catch(() => { if (active) setFailed(true) })
    return () => {
      active = false
      observer.disconnect()
      controls.dispose()
      if (model) dispose(model)
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [data])
  return <div className="model-preview" ref={mount}>{failed && <p role="status">{fallback}</p>}</div>
}

type Activity = 'idle' | 'choosing' | 'running' | 'done' | 'error'

const stages = [
  ['Завантаження GLB', 'Loading GLB'],
  ['Підготовка меша в Blender', 'Preparing mesh in Blender'],
  ['Конвертація текстури в PAA', 'Converting texture to PAA'],
  ['Побудова LOD і запис P3D', 'Building LODs and writing P3D'],
  ['Перевірка й збереження файлів', 'Checking and saving files'],
] as const

export function Models({ language, root, settings, onStatus }: {
  language: Lang; root?: string; settings: Settings; onStatus: (status: string) => void
}) {
  const tr = (uk: string, en: string) => language === 'uk' ? uk : en
  const [model, setModel] = useState('')
  const [preview, setPreview] = useState('')
  const [files, setFiles] = useState<ModelFiles>()
  const [activity, setActivity] = useState<Activity>('idle')
  const [stage, setStage] = useState(0)
  const [error, setError] = useState('')
  const [p3d, setP3d] = useState<{ name: string; lods: P3dLod[]; selected: number }>()
  const [p3dBusy, setP3dBusy] = useState(false)
  const [p3dError, setP3dError] = useState('')
  const p3dPanel = useRef<HTMLElement>(null)
  const output = useExportFolder(language, 'models', setError)
  const busy = p3dBusy || activity === 'choosing' || activity === 'running'
  const exportStatus = {
    idle: tr('Вибери кольоровий GLB', 'Choose a textured GLB'),
    choosing: tr('Вибір файла', 'Selecting a file'),
    running: tr(stages[stage][0], stages[stage][1]),
    done: tr('P3D і PAA готові', 'P3D and PAA are ready'),
    error: tr('Операцію не завершено', 'Operation did not finish'),
  }[activity]
  const status = p3dBusy ? tr('Відкриття P3D…', 'Opening P3D…') :
    p3d ? p3d.name : exportStatus
  const lod = p3d?.lods[p3d.selected]
  const previewFallback = tr('3D-прев’ю недоступне.', '3D preview is unavailable.')

  useEffect(() => onStatus(status), [status, onStatus])
  useEffect(() => {
    p3dPanel.current?.scrollIntoView({ block: 'nearest' })
  }, [p3d?.lods])
  async function choose() {
    setActivity('choosing')
    setError('')
    try {
      const path = await open({ filters: [{ name: 'GLB', extensions: ['glb'] }], multiple: false })
      if (typeof path !== 'string') {
        setActivity(activity)
        return
      }
      setModel(path.split(/[\\/]/).pop() || path)
      setPreview('')
      setP3d(undefined)
      setP3dError('')
      setFiles(undefined)
      setStage(0)
      setActivity('running')
      setPreview(await call<string>(language, 'previewModel', { path }))
      setFiles(await call<ModelFiles>(language, 'exportModel', { path, root, settings, output: output.destination }, message => {
        if (message.event === 'progress' && message.stage !== undefined && message.stage in stages) {
          const next = message.stage
          setStage(current => Math.max(current, next))
        }
      }))
      setActivity('done')
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
      setActivity('error')
    }
  }

  async function openP3d(path?: string) {
    setP3dBusy(true)
    setP3dError('')
    try {
      const picked = path ?? await open({ filters: [{ name: 'P3D', extensions: ['p3d'] }], multiple: false })
      if (typeof picked !== 'string') return
      const lods = await invoke<P3dLod[] | null>('preview_odol', { path: picked })
        ?? await call<P3dLod[]>(language, 'previewP3d', { path: picked })
      const visual = lods.reduce((best, candidate, index) => {
        const { resolution, triangles } = candidate
        return triangles && resolution >= 0 && resolution < (lods[best]?.resolution ?? 1000) ? index : best
      }, -1)
      const firstMesh = lods.findIndex(candidate => candidate.triangles > 0)
      const selected = visual >= 0 ? visual : firstMesh >= 0 ? firstMesh :
        lods.findIndex(candidate => candidate.vertices > 0)
      setP3d({ name: picked.split(/[\\/]/).pop() || picked, lods, selected })
    } catch (failure) {
      const reason = failure instanceof Error ? failure.message : String(failure)
      const messages: Record<string, string> = {
        invalid: tr('Файл ODOL пошкоджений або має непідтримувану структуру.', 'The ODOL file is damaged or uses an unsupported layout.'),
        empty: tr('У файлі ODOL немає вершин для огляду.', 'The ODOL file contains no vertices to display.'),
        read: tr('Не вдалося прочитати P3D.', 'Could not read the P3D file.'),
        size: tr('Вибери P3D розміром до 64 МБ.', 'Choose a P3D file of up to 64 MB.'),
      }
      const version = /^version:(\d+)$/.exec(reason)
      setP3dError(version ? tr(`ODOL v${version[1]} не підтримується. Підтримуються версії 53-56.`,
        `ODOL v${version[1]} is unsupported. Supported versions are 53-56.`) : messages[reason] ?? reason)
    } finally {
      setP3dBusy(false)
    }
  }

  async function reveal(path: string) {
    try {
      await call(language, 'revealModel', { path })
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    }
  }

  return <div className="model-tool">
    <section className="tool-input">
      <div className="tool-file-picker">
        <p>{tr('Експорт GLB у P3D і PAA', 'Export GLB to P3D and PAA')}</p>
        <div className="tool-file-actions">
          <button className="primary" disabled={busy} onClick={() => void choose()}><Upload size={16}/>{tr('Вибрати GLB', 'Choose GLB')}</button>
          <button disabled={busy} onClick={() => void openP3d()}><Box size={16}/>{tr('Відкрити P3D', 'Open P3D')}</button>
        </div>
      </div>
      <OutputFolder language={language} {...output} disabled={busy}/>
    </section>
    {p3dBusy && <p role="status">{status}</p>}
    {p3dError && <p className="model-error" role="alert">{p3dError}</p>}
    {p3d && lod && <section className="model-result" ref={p3dPanel}>
      <div className="tool-file-picker">
        <h2>{p3d.name}</h2>
        <label>LOD <select value={p3d.selected}
          onChange={event => setP3d({ ...p3d, selected: Number(event.target.value) })}>
          {p3d.lods.map((candidate, index) => <option key={index} value={index}>
            {index + 1} · {lodLabel(candidate.resolution)}
          </option>)}
        </select></label>
      </div>
      <p>{lod.vertices} {tr('вершин', 'vertices')} · {lod.faces} {tr('граней', 'faces')} · {lod.triangles} {tr('трикутників', 'triangles')}</p>
      {lod.vertices ? <Preview data={lod} fallback={previewFallback}/> :
        <p role="status">{tr('Цей LOD порожній.', 'This LOD is empty.')}</p>}
      <p>{tr('Огляд геометрії без текстур і матеріалів.', 'Geometry preview without textures or materials.')}</p>
    </section>}
    {activity !== 'idle' && <section className="model-status">
      <div className="model-status-head">
        <strong role="status">{exportStatus}</strong>
        {activity === 'running' && <span>{stage + 1} / {stages.length}</span>}
      </div>
      {model && <code className="model-output-path">{model}</code>}
      <progress aria-label={tr('Завершено етапів експорту', 'Completed export stages')}
        max={stages.length} value={activity === 'done' ? stages.length : activity === 'choosing' ? 0 : stage}/>
      <ol className="model-steps">
        {stages.map(([uk, en], index) => {
          const completed = activity === 'done' || (activity === 'running' || activity === 'error') && index < stage
          const current = (activity === 'running' || activity === 'error') && index === stage
          return <li key={en} data-state={completed ? 'done' : current ? activity : 'pending'}
            aria-current={current ? 'step' : undefined}>
            <span aria-hidden="true">{completed ? '✓' : index + 1}</span>{tr(uk, en)}
          </li>
        })}
      </ol>
      {error && <p role="alert" className="model-error">{error}</p>}
    </section>}
    {activity === 'idle' && error && <p className="model-error" role="alert">{error}</p>}
    {files && <section className="model-result">
      <h2>{tr('Файли результату', 'Output files')}</h2>
      <code className="model-output-path">{files.folder}</code>
      <div className="model-file-list"><code>{files.model}</code><code>data\{files.texture}</code></div>
      <h2>{tr('Перевірка P3D','P3D validation')}</h2>
      {files.validation.lods.map(lod=><div key={lod.resolution}>LOD {lod.resolution} · {lod.vertices} {tr('вершин','vertices')} · {lod.triangles} {tr('трикутників','triangles')} · {tr('видалено невикористаних','unused removed')} {lod.removedVertices}</div>)}
      <p>UV ✓ · {tr('Матеріалів','Materials')} {files.validation.materials}</p>
      <p>{tr('Колізія потребує створення Geometry та Fire Geometry LOD перед використанням у грі.',
             'Author Geometry and Fire Geometry LODs before in-game use.')}</p>
      <div className="tool-file-actions">
        <button onClick={() => void reveal(files.folder)}><FolderOpen size={16}/>{tr('Відкрити папку', 'Open folder')}</button>
        <button disabled={busy} onClick={() => void openP3d(`${files.folder}\\${files.model}`)}><Box size={16}/>{tr('Оглянути P3D', 'Preview P3D')}</button>
      </div>
    </section>}
    {preview && !p3d && <Preview data={preview} fallback={previewFallback}/>}
  </div>
}
