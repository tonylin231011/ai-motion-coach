export const reviewRules={version:1,minObservable:.6,fatigueDrop:.15,fatigueRun:3,highRate:.9,keepRate:.8,timedIncrease:.1,minTimedIncrease:5} as const
export const reviewCopy={
 depth:{title:'动作幅度变化',causes:['可能是本组后段疲劳','可能是起始位置发生变化'],cues:['下一次先重复开头的幅度','到达开头的位置再回程','先减少两次，复现开头动作']},
 tempo:{title:'动作速度变化',causes:['可能是后段疲劳','可能是在追赶计数'],cues:['按开头的节奏完成下一次','先暂停，再重复开头的速度','下一组减少一次，复现开头节奏']}
} as const
