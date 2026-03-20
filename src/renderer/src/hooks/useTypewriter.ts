import { useState, useEffect, useRef } from 'react'

interface UseTypewriterOptions {
  text: string
  speed?: number
  enabled?: boolean
}

function closeOpenMarkdown(partial: string): string {
  const boldCount = (partial.match(/\*\*/g) || []).length
  if (boldCount % 2 !== 0) partial += '**'
  const codeCount = (partial.match(/`/g) || []).length
  if (codeCount % 2 !== 0) partial += '`'
  return partial
}

export function useTypewriter({ text, speed = 18, enabled = true }: UseTypewriterOptions) {
  const [charIndex, setCharIndex] = useState(enabled ? 0 : text.length)
  const [isTyping, setIsTyping] = useState(enabled && text.length > 0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!enabled) {
      setCharIndex(text.length)
      setIsTyping(false)
      return
    }

    setCharIndex(0)
    setIsTyping(true)

    intervalRef.current = setInterval(() => {
      setCharIndex((prev) => {
        if (prev >= text.length) {
          clearInterval(intervalRef.current!)
          setIsTyping(false)
          return text.length
        }
        return prev + 1
      })
    }, speed)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [text, speed, enabled])

  const skip = () => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    setCharIndex(text.length)
    setIsTyping(false)
  }

  const displayText = closeOpenMarkdown(text.slice(0, charIndex))

  return { displayText, isTyping, skip }
}
