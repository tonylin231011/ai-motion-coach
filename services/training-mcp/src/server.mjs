import express from 'express'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { bearerMiddleware, createVerifier } from './auth.mjs'
import { EXERCISES, QueryError } from './training.mjs'
const page = {limit:z.number().int().min(1).max(100).default(50),offset:z.number().int().min(0).max(1999).default(0),asOf:z.iso.datetime().refine(s=>Date.parse(s)>=0&&Date.parse(s)<=Date.now()+300000).optional()}
const definitions = [
  {name:'list_recent_training',title:'最近训练记录',description:'读取本人最近N个上海自然日（含今天）的云端训练，默认7天，上限90天；分页后续调用复用返回的asOf和nextOffset。不会修改数据。',schema:z.object({days:z.number().int().min(1).max(90).default(7),...page}).strict(),run:(r,a)=>r.list(a)},
  {name:'list_exercise_history',title:'按动作查询训练历史',description:'按动作读取本人云端历史，默认90天，上限365天。保留每侧/每只手计次和实际保持时长；fast/shallow仅是提示。',schema:z.object({exercise:z.enum(EXERCISES),days:z.number().int().min(1).max(365).default(90),...page}).strict(),run:(r,a)=>r.list(a)},
  {name:'get_training_detail',title:'读取一次训练的动作明细',description:'用前两个工具返回的sessionId读取既有训练。每页最多200条动作明细；用nextRecordOffset继续。无修改或删除能力。',schema:z.object({sessionId:z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/),recordOffset:z.number().int().min(0).max(10000).default(0),recordLimit:z.number().int().min(1).max(200).default(100)}).strict(),run:(r,a)=>r.detail(a)},
]
export function createMcpServer(config, reader) {
  const server = new Server({name:'ai-motion-coach-training',version:'2.2.0'},{capabilities:{tools:{}}})
  const securitySchemes=[{type:'oauth2',scopes:[config.scope]}]
  server.setRequestHandler(ListToolsRequestSchema,async()=>({tools:definitions.map(d=>({name:d.name,title:d.title,description:d.description,inputSchema:z.toJSONSchema(d.schema,{target:'draft-7'}),annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false},securitySchemes,_meta:{securitySchemes}}))}))
  server.setRequestHandler(CallToolRequestSchema,async request=>{
    const d=definitions.find(x=>x.name===request.params.name)
    const parsed=d?.schema.safeParse(request.params.arguments || {})
    if(!d || !parsed?.success)return {isError:true,content:[{type:'text',text:'invalid_tool_or_arguments: query outside supported read-only schema'}]}
    try {
      const data=await d.run(reader,parsed.data)
      const text=JSON.stringify(data)
      if(Buffer.byteLength(text)>256*1024)throw new QueryError('result_size_limit')
      return {content:[{type:'text',text}],structuredContent:data}
    } catch(e) {
      const code=e instanceof QueryError?e.code:'query_failed'
      return {isError:true,content:[{type:'text',text:`${code}: No complete result. Retry with a smaller page or ask the operator to check service limits; do not infer missing training.`}]}
    }
  })
  return server
}
export function createApp(config,reader,{verify=createVerifier(config)}={}) {
  const app=express();app.disable('x-powered-by')
  let active=0;const windows=new Map()
  app.use((req,res,next)=>{
    res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'})
    if(!config.allowedHosts.includes(req.headers.host))return res.status(403).json({error:'host_not_allowed'})
    const origin=req.headers.origin
    if(origin&&!config.allowedOrigins.includes(origin))return res.status(403).json({error:'origin_not_allowed'})
    if(origin)res.set({'Access-Control-Allow-Origin':origin,Vary:'Origin','Access-Control-Allow-Headers':'Authorization, Content-Type, MCP-Protocol-Version, MCP-Session-Id, Mcp-Method, Mcp-Name','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Expose-Headers':'WWW-Authenticate'})
    next()
  })
  const metadata={resource:config.resource,authorization_servers:[config.issuer],scopes_supported:[config.scope],bearer_methods_supported:['header'],resource_name:'AI Motion Coach private training'}
  app.get(['/.well-known/oauth-protected-resource/training-mcp/mcp','/.well-known/oauth-protected-resource'],(_req,res)=>res.json(metadata))
  app.get('/training-mcp/healthz',(_req,res)=>res.json({status:'ok',version:'2.2.0'}))
  app.options('/training-mcp/mcp',(_req,res)=>res.status(204).end())
  app.use('/training-mcp/mcp',bearerMiddleware(config,verify))
  app.use('/training-mcp/mcp',(req,res,next)=>{
    const sub=res.locals.principal.subject,now=Date.now();let window=windows.get(sub)
    if(!window||now-window.start>=60000){window={start:now,count:0};windows.set(sub,window)}
    if(++window.count>60||active>=4){res.set('Retry-After','60');return res.status(429).json({error:'rate_limited'})}
    next()
  })
  app.post('/training-mcp/mcp',express.json({limit:'32kb',strict:true}),(req,res,next)=>{
    if(Array.isArray(req.body))return res.status(400).json({error:'batch_not_supported'})
    next()
  },async(req,res)=>{
    const server=createMcpServer(config,reader)
    const transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true})
    active++
    let closed=false
    const cleanup=()=>{if(!closed){closed=true;active--;void transport.close();void server.close()}}
    res.on('close',cleanup)
    try {await server.connect(transport);await transport.handleRequest(req,res,req.body)}
    catch {if(!res.headersSent)res.status(500).json({error:'mcp_request_failed'})}
    finally {if(res.writableEnded)cleanup()}
  })
  app.all('/training-mcp/mcp',(_req,res)=>{res.set('Allow','POST, OPTIONS');res.status(405).json({error:'method_not_allowed'})})
  app.use((_req,res)=>res.status(404).json({error:'not_found'}))
  app.use((error,_req,res,_next)=>res.status(error.type==='entity.too.large'?413:400).json({error:'invalid_request'}))
  return app
}
