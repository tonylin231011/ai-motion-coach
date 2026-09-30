import asyncio
from pathlib import Path
import edge_tts
import re

phrases = {'start':'语音教练已开启，正在准备摄像头。','ready':'教练已就位，请保持全身入镜。','WAITING':'准备动作。','STANDING':'站立准备。','DESCENDING':'慢慢下蹲。','BOTTOM':'到达最低点。','ASCENDING':'起身，站稳。','lost':'未识别到身体，请保持全身入镜。','finished':'训练已结束。','on':'语音已开启。','off':'语音已关闭。','test':'你好，我是你的动作教练。听到这句话，说明语音播放正常。','completed':'完成一次。'}
phrases.update({f'rep-{i}':f'已完成{i}次。' for i in range(1,101)})
phrases = {
 'coach-start':'准备好了吗？侧身站好，让全身进入画面。按你舒服的范围来，我们慢慢开始。',
 'coach-good1':'这次下蹲和起身都完成了，做得不错！',
 'coach-good2':'很好，又完成了一次，按自己的节奏来。',
 'coach-good3':'这次动作幅度不错，继续保持。',
 'coach-shallow':'这次幅度比较小，按舒适的范围来，不用勉强蹲深。',
 'coach-fast':'这次节奏有点快，下一次慢一点，控制好起身。',
 'coach-unclear':'刚才没看清，这次先不评价。调整一下位置吧。',
 'coach-incomplete':'先回到站立，再开始下一次，不着急。',
}
phrases = {f'v5-{key}': text for key,text in re.findall(r"^  (\w+): '([^']+)'", Path('src/coachDetector.ts').read_text(encoding='utf-8'), re.M)}
phrases.update({
 'v5-start':'准备开练！侧身站稳，全身入镜。每一次都认真做，跟我一起找好节奏！',
 'v5-finished':'好，这组完成！你的次数和表现都在总结里。看看下一组要改进什么，休息好，再出发！',
 'v5-empty':'这组还没有识别到下蹲。下次先侧身站稳，让全身进入画面，我们再开始。',
})
phrases.update({f'v8-push-{key}': text for key,text in re.findall(r"^  (\w+): '([^']+)'", Path('src/pushupDetector.ts').read_text(encoding='utf-8'), re.M)})
phrases.update({
 'v8-push-start':'今天练俯卧撑！正面或侧面都可以，让肩、肘和手腕入镜，不用拍到脚。正常下压，再推回，开始！',
 'v8-push-empty':'还没有识别到完整动作。请让肩、肘和手腕清晰入镜，手机放稳，正常下压再推回。',
})
phrases.update({f'v12-plank-{key}': text for key,text in re.findall(r"^  (\w+): '([^']+)'", Path('src/plankDetector.ts').read_text(encoding='utf-8'), re.M)})
phrases.update({
 'v12-plank-start':'今天练平板支撑！摆好前臂支撑，默认会自动起表。听到开始计时后保持自然呼吸，休息时请点暂停。',
 'v12-plank-finished':'这组平板支撑结束！保持时长和中断情况已经显示在总结里。休息一下，再继续！',
})
phrases.update({f'v16-twist-{key}': text for key,text in re.findall(r"^  (\w+): '([^']+)'", Path('src/twistDetector.ts').read_text(encoding='utf-8'), re.M)})
phrases.update({
 'v16-twist-start':'今天练俄罗斯转体！坐好并正对镜头，让肩、髋和至少一只手入镜。向左一次，向右一次，各计一次。',
 'v16-twist-finished':'这组俄罗斯转体结束！完成次数和训练用时，已经记录在总结里。',
})
phrases.update({f'v15-crunch-{key}': text for key,text in re.findall(r"^  (\w+): '([^']+)'", Path('src/reverseCrunchDetector.ts').read_text(encoding='utf-8'), re.M)})
phrases.update({
 'v15-crunch-start':'今天练反向卷腹！手机放在身体侧面，让肩、髋和膝盖入镜。先把腿放远，再收膝并慢慢放回。',
 'v15-crunch-finished':'这组反向卷腹结束！次数和用时已经记录好了。',
})
phrases.update({f'v17-curl-{key}': text for key,text in re.findall(r"^  (\w+): '([^']+)'", Path('src/curlDetector.ts').read_text(encoding='utf-8'), re.M)})
phrases.update({
 'v17-curl-start':'今天练哑铃弯举！拍清肩、肘和手腕，先把手臂自然放下。每只手各计一次，双手一起一轮共两次。上臂稳住，弯起来，再控制放下！',
 'v17-curl-finished':'这组哑铃弯举完成！左右手次数和节奏点评都在总结里。休息一下，再继续！',
})
async def main():
    destination = Path('public/voice')
    destination.mkdir(parents=True, exist_ok=True)
    sem = asyncio.Semaphore(3)
    async def generate(key,text):
        async with sem:
            path = destination / f'{key}.mp3'
            if path.exists() and path.stat().st_size > 1000: return
            await edge_tts.Communicate(text,'zh-CN-XiaoyiNeural',rate='+8%',pitch='+2Hz').save(str(path))
    await asyncio.gather(*(generate(k,v) for k,v in phrases.items()))
    print(f'Generated {len(phrases)} MP3 clips', flush=True)
asyncio.run(main())
