import {loadConfig} from './config.mjs'
import {TrainingReader} from './training.mjs'
import {createApp} from './server.mjs'
try {
  const config=loadConfig()
  const reader=new TrainingReader(config)
  const http=createApp(config,reader).listen(config.port,'0.0.0.0',()=>console.log('training-mcp ready'))
  http.requestTimeout=30000;http.headersTimeout=10000
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{http.close(()=>process.exit(0));setTimeout(()=>process.exit(1),10000).unref()})
} catch { console.error('training-mcp startup failed: check required server configuration');process.exitCode=1 }
