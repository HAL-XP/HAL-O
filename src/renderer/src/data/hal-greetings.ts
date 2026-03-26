/**
 * HAL-O Welcome Greetings — context-aware phrases spoken after intro spline.
 *
 * WELCOME1: After the camera spline completes, HAL reads project state and speaks
 * a greeting. The sphere pulses with the voice. First-launch vs returning behavior.
 *
 * These templates use placeholders:
 *   {name}      — user's display name (or "sir" if unknown)
 *   {project}   — name of the most recently active project
 *   {count}     — number of enlisted projects
 *   {time}      — time-of-day greeting ("good morning", "good evening", etc.)
 *   {away}      — human-friendly duration since last session ("2 hours", "a few days")
 */

export interface GreetingContext {
  name: string
  project: string
  count: number
  hour: number
  isFirstLaunch: boolean
  minutesSinceLastSession: number
}

function timeGreeting(hour: number): string {
  if (hour < 6) return 'burning the midnight oil'
  if (hour < 12) return 'good morning'
  if (hour < 17) return 'good afternoon'
  if (hour < 21) return 'good evening'
  return 'good evening'
}

function awayDuration(minutes: number): string {
  if (minutes < 60) return 'a few minutes'
  if (minutes < 120) return 'about an hour'
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)} hours`
  if (minutes < 60 * 48) return 'about a day'
  return `${Math.round(minutes / (60 * 24))} days`
}

// ── First Launch Greetings ──
const FIRST_LAUNCH = [
  'Welcome to HAL-O. I am your development companion. I see you have {count} projects ready to go. Shall we begin?',
  '{time}. This is HAL-O, your mission control. {count} projects detected and ready for inspection. Where would you like to start?',
  'Systems online. Welcome aboard. I have detected {count} projects in your workspace. Select one and I will prepare your environment.',
]

// ── Returning User — Short Absence (<2 hours) ──
const SHORT_RETURN = [
  '{time}, {name}. Welcome back. {project} is right where you left it.',
  'Ah, {name}. Back already. {project} awaits.',
  '{time}. {project} is still warm. Ready when you are.',
]

// ── Returning User — Medium Absence (2-24 hours) ──
const MEDIUM_RETURN = [
  '{time}, {name}. It has been {away}. {project} is ready for you.',
  '{time}. You have been away for {away}. I kept {project} in order.',
  'Welcome back, {name}. {away} since our last session. {project} is standing by.',
]

// ── Returning User — Long Absence (>24 hours) ──
const LONG_RETURN = [
  '{time}, {name}. It has been {away}. I have been waiting. {project} needs your attention.',
  'At last. {away}, {name}. I was beginning to wonder. {project} is where we left off.',
  '{time}. It has been {away} since you were last here. Your {count} projects have been patient.',
]

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

export function generateGreeting(ctx: GreetingContext): string {
  const time = timeGreeting(ctx.hour)
  const away = awayDuration(ctx.minutesSinceLastSession)

  let template: string
  if (ctx.isFirstLaunch) {
    template = pickRandom(FIRST_LAUNCH)
  } else if (ctx.minutesSinceLastSession < 120) {
    template = pickRandom(SHORT_RETURN)
  } else if (ctx.minutesSinceLastSession < 60 * 24) {
    template = pickRandom(MEDIUM_RETURN)
  } else {
    template = pickRandom(LONG_RETURN)
  }

  return template
    .replace(/{name}/g, ctx.name)
    .replace(/{project}/g, ctx.project)
    .replace(/{count}/g, String(ctx.count))
    .replace(/{time}/g, time)
    .replace(/{away}/g, away)
}
