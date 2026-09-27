import type { Session } from './history'
export function dayKey(date:Date) {return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`}
export function dailyActivity(sessions:Session[]) {
  const days=new Map<string,{durationMs:number;sessions:Session[]}>()
  for(const session of sessions) {
    if(!Number.isFinite(session.endedAt) || !Number.isFinite(session.durationMs) || session.durationMs<=0) continue
    const key=dayKey(new Date(session.endedAt)),day=days.get(key) ?? {durationMs:0,sessions:[]}
    day.durationMs+=session.durationMs;day.sessions.push(session);days.set(key,day)
  }
  return days
}
export function calendarDays(now:Date,weekOffset=0) {
  const end=new Date(now.getFullYear(),now.getMonth(),now.getDate(),12)
  end.setDate(end.getDate()-(end.getDay()+6)%7+6+weekOffset*7)
  return Array.from({length:112},(_,i)=>{const d=new Date(end);d.setDate(d.getDate()-111+i);return d})
}
