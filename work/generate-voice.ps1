$ErrorActionPreference = 'Stop'
$destination = Join-Path $PSScriptRoot '../public/voice'
New-Item -ItemType Directory -Force -Path $destination | Out-Null
$speaker = New-Object -ComObject SAPI.SpVoice
$speaker.Voice = @($speaker.GetVoices() | Where-Object { $_.GetDescription() -match 'Huihui' })[0]
$phrases = @{
  start = '语音教练已开启，正在准备摄像头。'
  ready = '教练已就位，请保持全身入镜。'
  WAITING = '准备动作。'
  STANDING = '站立准备。'
  DESCENDING = '慢慢下蹲。'
  BOTTOM = '到达最低点。'
  ASCENDING = '起身，站稳。'
  lost = '未识别到身体，请保持全身入镜。'
  finished = '训练已结束。'
  on = '语音已开启。'
  off = '语音已关闭。'
  test = '你好，我是你的动作教练。听到这句话，说明语音播放正常。'
  completed = '完成一次。'
}
1..100 | ForEach-Object { $phrases["rep-$_"] = "已完成$_ 次。" }
foreach ($key in $phrases.Keys) {
  $stream = New-Object -ComObject SAPI.SpFileStream
  $stream.Format.Type = 22
  $stream.Open((Join-Path $destination "$key.wav"), 3, $false)
  $speaker.AudioOutputStream = $stream
  [void]$speaker.Speak($phrases[$key])
  $stream.Close()
}
Write-Output "Generated $($phrases.Count) Chinese WAV clips."
