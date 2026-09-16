import { useEffect, useState } from 'react'
import { Image, Loader2 } from 'lucide-react'
import { requireSupabase } from '../../lib/supabase.ts'
import type { OwnerCopy } from './owner.copy.ts'

// No reusable signed URLs or persistent cache for privileged image reads.
export function OwnerImage({ path, todo, t }: { path: string; todo: boolean; t: OwnerCopy }) {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!open) return
    let active = true
    let objectUrl: string | null = null
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 20_000)
    setFailed(false)
    void requireSupabase().storage.from(todo ? 'todo-images' : 'card-images').download(path, {}, { signal: controller.signal, cache: 'no-store' })
      .then(({ data, error }) => {
        if (!active) return
        if (error || !data) { setFailed(true); return }
        objectUrl = URL.createObjectURL(data)
        setUrl(objectUrl)
      }).catch(() => { if (active) setFailed(true) }).finally(() => window.clearTimeout(timeout))
    return () => { active = false; controller.abort(); window.clearTimeout(timeout); if (objectUrl) URL.revokeObjectURL(objectUrl); setUrl(null) }
  }, [open, path, todo])
  return <div className="owner-image">
    <button className="secondary-button" type="button" onClick={() => setOpen(!open)}><Image size={15} />{open ? t.hideImage : t.image}</button>
    {open && (failed ? <p role="alert">{t.imageError}</p> : url ? <img src={url} alt="" onError={() => setFailed(true)} /> : <Loader2 className="animate-spin" size={20} />)}
  </div>
}
