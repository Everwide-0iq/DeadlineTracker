import { useEffect, useRef, useState } from 'react'

export function useCompletionAnimation(isDone: boolean) {
  const previousIsDoneRef = useRef(isDone)
  const [isCompleting, setIsCompleting] = useState(false)

  useEffect(() => {
    if (!previousIsDoneRef.current && isDone) {
      setIsCompleting(true)
      previousIsDoneRef.current = isDone

      const timerId = window.setTimeout(() => setIsCompleting(false), 900)
      return () => window.clearTimeout(timerId)
    }

    previousIsDoneRef.current = isDone
    return undefined
  }, [isDone])

  return isCompleting
}
