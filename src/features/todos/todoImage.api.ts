import { requireSupabase } from '../../lib/supabase.ts'
import { createSignedUrlCache } from '../../lib/signedUrlCache.ts'
import type { PreparedCardImage } from '../cards/cardImage.api.ts'

const bucket = 'todo-images'
const lifetimeSeconds = 60 * 60
const refreshPaddingMs = 60 * 1000
const signedUrls = createSignedUrlCache({
  lifetimeSeconds: lifetimeSeconds,
  refreshPaddingMs: refreshPaddingMs,
})

export async function uploadTodoImage(itemId: string, userId: string, image: PreparedCardImage) {
  const path = `${userId}/${itemId}-${crypto.randomUUID()}.webp`
  const { error } = await requireSupabase().storage.from(bucket).upload(path, image.blob, {
    cacheControl: '3600',
    contentType: 'image/webp',
    upsert: false,
  })

  if (error) throw error
  return {
    imageHeight: image.height,
    imagePath: path,
    imageSize: image.size,
    imageWidth: image.width,
  }
}

export async function removeTodoImage(path: string | null) {
  if (!path) return
  signedUrls.invalidate(path)
  const supabase = requireSupabase()
  const { error } = await supabase.storage.from(bucket).remove([path])
  if (error) throw error
  const { error: queueError } = await supabase.from('todo_image_cleanup_queue').delete().eq('image_path', path)
  if (queueError) throw queueError
}

export async function cleanupPendingTodoImages() {
  const supabase = requireSupabase()
  for (let batch = 0; batch < 20; batch += 1) {
    const { data, error } = await supabase.from('todo_image_cleanup_queue').select('image_path').order('created_at').limit(100)
    if (error) throw error
    const paths = (data ?? []).map((row) => row.image_path)
    if (paths.length === 0) return
    const { error: removeError } = await supabase.storage.from(bucket).remove(paths)
    if (removeError) throw removeError
    signedUrls.invalidateMany(paths)
    const { error: queueError } = await supabase.from('todo_image_cleanup_queue').delete().in('image_path', paths)
    if (queueError) throw queueError
    if (paths.length < 100) return
  }
}

export async function getTodoImageSignedUrl(path: string) {
  return signedUrls.get(path, async () => {
    const { data, error } = await requireSupabase().storage.from(bucket).createSignedUrl(path, lifetimeSeconds)
    if (error) throw error
    return data.signedUrl
  })
}

export const getCachedTodoImageSignedUrl = (path: string) => signedUrls.peek(path)
