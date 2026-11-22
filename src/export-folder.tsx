import { useEffect, useState } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { FolderOpen } from 'lucide-react'
import { call } from './backend'
import type { Lang } from './locale'

export function useExportFolder(language: Lang, kind: 'models' | 'textures', onError: (message: string) => void) {
  const [root, setRoot] = useState('')
  const [destination, setDestination] = useState('')
  useEffect(() => {
    let active = true
    void call<string>(language, 'exportFolder', { kind }).then(path => {
      if (active) setRoot(path)
    }).catch(failure => { if (active) onError(String(failure)) })
    return () => { active = false }
  }, [language, kind, onError])

  async function chooseFolder() {
    try {
      const path = await open({ directory: true, multiple: false, defaultPath: destination || root || undefined })
      if (typeof path === 'string') {
        const resolved = await call<string>(language, 'exportFolder', { kind, path })
        setDestination(resolved)
      }
    } catch (failure) {
      onError(failure instanceof Error ? failure.message : String(failure))
    }
  }
  return { path: destination || root, destination, chooseFolder }
}

export function OutputFolder({ language, path, chooseFolder, disabled }: {
  language: Lang; path: string; chooseFolder: () => Promise<void>; disabled: boolean
}) {
  return <div className="output-folder">
    <div className="grow">
      <small>{language === 'uk' ? 'Зберігати в' : 'Save to'}</small>
      <code className="model-output-path" title={path}>{path || '-'}</code>
    </div>
    <button className="btn-sm" disabled={disabled} onClick={() => void chooseFolder()}><FolderOpen size={15}/>
      {language === 'uk' ? 'Вибрати папку' : 'Choose folder'}
    </button>
  </div>
}
