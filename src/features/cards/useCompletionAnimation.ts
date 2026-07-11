import { useEffect, useRef, useState } from 'react'

export function useCompletionAnimation(isDone: boolean) {
  const previousIsDoneRef = useRef(isDone)
  const [isCompleting, setIsCompleting] = useState(false)

  useEffect(() => {
    if (!isDone) {
      previousIsDoneRef.current = false
      setIsCompleting(false)
      return undefined
    }

    if (!previousIsDoneRef.current && isDone) {
      setIsCompleting(true)
      previousIsDoneRef.current = true

      const timerId = window.setTimeout(() => setIsCompleting(false), 900)
      return () => window.clearTimeout(timerId)
    }

    previousIsDoneRef.current = true
    return undefined
  }, [isDone])

  return isCompleting
}
