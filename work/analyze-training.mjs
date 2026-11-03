import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
export const localDay = ms => new Date(ms + 8*3600000).toISOString().slice(0,10)
export function analyzeTraining(input) {
  const raw = Array.isArray(input) ? input : input.sessions
  if (!Array.isArray(raw)) throw new Error('Expected sessions array')
  const unique = new Map()
  for (const s of raw) {
    if (!s || typeof s.id !== 'string' || !Number.isFinite(s.endedAt) || !Array.isArray(s.records)) throw new Error('Invalid session')
    if (unique.has(s.id) && JSON.stringify(unique.get(s.id)) !== JSON.stringify(s)) throw new Error('Conflicting duplicate session')
    unique.set(s.id,s)
  }
  const sessions = [...unique.values()].sort((a,b)=>a.endedAt-b.endedAt)
  const daily = {}, totals = {}, issues = { missingHold:0, validWithHint:0, zeroAngle:0, records:0, countModes:{} }
  for (const s of sessions) {
    const day = localDay(s.endedAt), timed = ['wall_sit','plank'].includes(s.exercise)
    daily[day] ??= {}
    const init = () => ({sessions:0,reps:0,attempts:0,heldSeconds:0,elapsedSeconds:0,bestSeconds:0,completedSets:0,attemptedSets:0,left:0,right:0,records:0,validRecords:0,hints:0})
    daily[day][s.exercise] ??= init(); totals[s.exercise] ??= init()
    if (timed && !Number.isFinite(s.hold?.heldMs)) issues.missingHold++
    const mode = s.countMode || 'legacy_unspecified'; issues.countModes[mode]=(issues.countModes[mode]||0)+1
    for (const dest of [daily[day][s.exercise],totals[s.exercise]]) {
      dest.sessions++; dest.elapsedSeconds += s.durationMs/1000
      // Never substitute elapsed duration for holding time; never mix timed sets with reps.
      if (timed) { dest.heldSeconds += (s.hold?.heldMs ?? 0)/1000; dest.bestSeconds = Math.max(dest.bestSeconds,(s.hold?.bestMs ?? 0)/1000) }
      else {dest.reps+=s.repCount;dest.attempts+=s.attemptCount}
      dest.completedSets+=s.wallSit?.completedSets ?? 0;dest.attemptedSets+=s.wallSit?.sets?.length ?? 0
      dest.left+=s.armCounts?.left ?? 0;dest.right+=s.armCounts?.right ?? 0
      dest.records+=s.records.length;dest.validRecords+=s.records.filter(r=>r.valid).length;dest.hints+=s.records.filter(r=>r.issue).length
    }
    issues.records+=s.records.length;issues.validWithHint+=s.records.filter(r=>r.valid&&r.issue).length;issues.zeroAngle+=s.records.filter(r=>r.minAngle===0).length
  }
  return {source:input.source ?? 'provided export', fetchedAt:input.fetchedAt ?? null,completeScan:input.completeScan ?? null,
    count:sessions.length,duplicatesRemoved:raw.length-sessions.length,trainingDays:Object.keys(daily).length,
    firstDay:sessions.length?localDay(sessions[0].endedAt):null,lastDay:sessions.length?localDay(sessions.at(-1).endedAt):null,
    issues,totals,daily}
}
if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const input=JSON.parse(await readFile(process.argv[2],'utf8'))
  console.log(JSON.stringify(analyzeTraining(input),null,2))
}
