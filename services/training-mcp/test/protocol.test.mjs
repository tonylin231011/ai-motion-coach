import {test} from 'node:test'
import assert from 'node:assert/strict'
import {Client} from '@modelcontextprotocol/sdk/client/index.js'
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import {tokens,config} from './helpers.mjs'
import {createApp} from '../src/server.mjs'
import {TrainingReader} from '../src/training.mjs'

test('real HTTP MCP initialize/list/call with OAuth JWT and read-only upstream adapter',async()=>{
  const {verify,sign}=await tokens();let upstreamCalls=0
  const reader=new TrainingReader({endpoint:'https://upstream.example/training-sync',readToken:'upstream-private-token',fetchImpl:async(_url,opts)=>{
    upstreamCalls++;assert.equal(opts.method,'GET');assert.equal(opts.headers.Authorization,'Bearer upstream-private-token')
    return Response.json({schemaVersion:1,sessions:[{id:'existing',exercise:'squat',endedAt:Date.now()-1000,durationMs:5000,repCount:2,attemptCount:2,records:[]}],nextCursor:null})
  }})
  const cfg={...config,allowedHosts:[]};const app=createApp(cfg,reader,{verify})
  const http=app.listen(0,'127.0.0.1');await new Promise(r=>http.once('listening',r));const host=`127.0.0.1:${http.address().port}`;cfg.allowedHosts.push(host)
  const base=`http://${host}`, url=new URL(base+'/training-mcp/mcp')
  const client=new Client({name:'integration-test',version:'1.0.0'})
  try{
    const unauth=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(unauth.status,401);assert.ok(unauth.headers.get('www-authenticate').includes(cfg.metadataUrl));assert.equal(upstreamCalls,0)
    const bad=await fetch(url,{method:'POST',headers:{Authorization:'Bearer upstream-private-token'}});assert.equal(bad.status,401)
    const metadata=await (await fetch(base+'/.well-known/oauth-protected-resource/training-mcp/mcp')).json();assert.equal(metadata.resource,cfg.resource)
    const access=await sign()
    const evil=await fetch(url,{headers:{Authorization:`Bearer ${access}`,Origin:'https://evil.example'}});assert.equal(evil.status,403)
    await client.connect(new StreamableHTTPClientTransport(url,{requestInit:{headers:{Authorization:`Bearer ${access}`}}}))
    const {tools}=await client.listTools();assert.equal(tools.length,3);assert.ok(tools.every(t=>t.annotations.readOnlyHint&&!t.annotations.destructiveHint&&t._meta?.securitySchemes?.[0].type==='oauth2'))
    const rawTools=await (await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${access}`,'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:100,method:'tools/list',params:{}})})).json();assert.equal(rawTools.result.tools[0].securitySchemes[0].type,'oauth2')
    const recent=await client.callTool({name:'list_recent_training',arguments:{days:7}});assert.equal(recent.structuredContent.sessions[0].id,'existing');assert.ok(!JSON.stringify(recent).includes('upstream-private-token'))
    const detail=await client.callTool({name:'get_training_detail',arguments:{sessionId:'existing'}});assert.equal(detail.structuredContent.found,true)
    const count=upstreamCalls
    for(const call of [{name:'delete_training',arguments:{sessionId:'existing'}},{name:'list_recent_training',arguments:{days:999}},{name:'get_training_detail',arguments:{sessionId:'existing',endpoint:'https://evil.example'}}])assert.equal((await client.callTool(call)).isError,true)
    assert.equal(upstreamCalls,count)
    assert.equal((await fetch(url,{method:'DELETE',headers:{Authorization:`Bearer ${access}`}})).status,405)
  }finally{await client.close();http.closeAllConnections();await new Promise(r=>http.close(r))}
})
