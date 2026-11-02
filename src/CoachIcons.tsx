import type { Exercise } from './types'

const poses: Record<Exercise, { head: [number, number]; body: string; extra?: string }> = {
  squat: { head: [36, 13], body: 'M34 22 27 39 45 48 32 65H45 M29 36 17 47 22 64H12 M33 25 48 31 61 28' },
  pushup: { head: [57, 28], body: 'M49 30 29 40 9 52H19 M45 33 51 44 48 54H61 M29 40 39 45', extra: 'M7 58H65' },
  plank: { head: [56, 25], body: 'M48 29 29 38 9 51H19 M46 31 44 51H61', extra: 'M7 57H65' },
  russian_twist: { head: [32, 15], body: 'M31 23 25 47 43 51 58 43 M25 47 18 56 40 61 54 55 M30 29 42 38 53 33', extra: 'M10 30Q7 20 18 19 M10 30 9 24 M10 30 16 29' },
  reverse_crunch: { head: [12, 48], body: 'M21 49 37 47 41 29 57 22 M37 47 46 37 62 37 M23 48 30 55H43', extra: 'M5 61H65' },
  dumbbell_curl: { head: [35, 12], body: 'M35 21V43 M35 43 26 65 M35 43 44 65 M33 25 22 41 14 29 M37 25 48 41 57 29', extra: 'M8 26 20 30 M9 23 7 29 M21 27 19 33 M51 30 63 26 M50 27 52 33 M62 23 64 29' },
  wall_sit: { head: [23, 15], body: 'M23 24V44H48V64H59 M24 28 34 40H49', extra: 'M14 7V65 M9 12H14 M9 25H14 M9 38H14 M9 51H14 M9 64H14' },
}

export function ExerciseIcon({ exercise }: { exercise: Exercise }) {
  const pose = poses[exercise]
  return <svg className="exercise-icon" viewBox="0 0 72 72" fill="none" aria-hidden="true">
    <circle cx="36" cy="37" r="30" fill="currentColor" opacity=".07" />
    <g stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx={pose.head[0]} cy={pose.head[1]} r="5" fill="currentColor" stroke="none" />
      <path d={pose.body} />
      {pose.extra && <path d={pose.extra} strokeWidth="2" opacity=".5" />}
    </g>
  </svg>
}

const paths = {
  train: 'M5 8v8m-3-6v4m17-6v8m3-6v4M5 12h14',
  history: 'M5 20V10m7 10V4m7 16v-7',
  settings: 'M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1 1-3M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  camera: 'M3 7h4l2-3h6l2 3h4v13H3V7m13 6a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  cloud: 'M7 18H5a4 4 0 0 1-1-8 8 8 0 0 1 15-2 5 5 0 0 1 0 10h-2M9 14l2 2 4-5',
  sound: 'M4 9h4l5-4v14l-5-4H4V9m12-1a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14',
  export: 'M12 15V3m-4 4 4-4 4 4M4 13v7h16v-7',
  arrow: 'm9 5 7 7-7 7',
} as const
export function Icon({ name }: { name: keyof typeof paths }) {
  return <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>
}
