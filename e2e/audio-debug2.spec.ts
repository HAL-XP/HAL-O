import { test } from '@playwright/test'
import { launchApp } from './electron'
import type { ElectronApplication, Page } from 'playwright-core'

let app: ElectronApplication
let page: Page
test.setTimeout(120_000)

test('Debug audio - CREATE analyser then play', async () => {
  ;({ app, page } = await launchApp())
  await page.evaluate(() => {
    localStorage.setItem('hal-o-setup-done', '1')
    localStorage.setItem('hal-o-demo-mode', 'true')
    localStorage.setItem('hal-o-demo-cards', '5')
    localStorage.setItem('hal-o-gpu-wizard-done', '1')
    localStorage.setItem('hal-o-renderer', 'pbr-holo')
    localStorage.setItem('hal-o-sphere-style', 'animated-core')
    localStorage.setItem('hal-o-tutorial-done', '1')
    localStorage.setItem('hal-o-intro-animation', 'false')
  })
  await page.reload()
  await page.waitForTimeout(8000)

  const result = await page.evaluate(async () => {
    const logs: string[] = []
    const w = window as any

    // STEP 1: Force-create the AnalyserNode by calling the app's audio init
    const ctx = new AudioContext()
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 256
    analyser.smoothingTimeConstant = 0.3
    analyser.connect(ctx.destination)
    w.__haloAudioAnalyser = analyser
    w.__halAudioAnalyser = analyser
    logs.push('Created AnalyserNode manually: fftSize=256, smoothing=0.3')

    if (ctx.state === 'suspended') {
      await ctx.resume()
      logs.push('AudioContext resumed')
    }

    // STEP 2: Play audio through it
    const url = 'file:///C:/Users/dindo/AppData/Local/Temp/hal-combined.wav'
    const a = new Audio(url)
    a.volume = 1.0
    const source = ctx.createMediaElementSource(a)
    const gain = ctx.createGain()
    gain.gain.value = 5.0
    source.connect(gain)
    gain.connect(analyser)
    w.__halSpeaking = true
    logs.push('Audio connected: source→gain(5x)→analyser→destination')

    await a.play()
    logs.push('Audio playing')

    // STEP 3: Read FFT at multiple points
    const buf = new Uint8Array(analyser.frequencyBinCount)
    for (let i = 0; i < 5; i++) {
      await new Promise(r => setTimeout(r, 300))
      analyser.getByteFrequencyData(buf)
      const sum = buf.reduce((a: number, b: number) => a + b, 0)
      const max = Math.max(...buf)
      const nonZero = buf.filter((v: number) => v > 0).length
      logs.push(`FFT@${(i+1)*300}ms: sum=${sum} max=${max} nonZero=${nonZero}/${buf.length}`)
    }

    return logs
  })

  for (const log of result) {
    console.log('[DEBUG]', log)
  }

  await app?.close()
})
