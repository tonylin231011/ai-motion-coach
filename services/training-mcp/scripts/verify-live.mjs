// Read-only acceptance. Fails if configuration or a real existing record is absent.
// Does not create fixtures, delete records, or print tokens / workout details.
import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {Client} from '@modelcontextprotocol/sdk/client/index.js'
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import {loadConfig} from '../src/config.mjs'
import {TrainingReader} from '../src/training.mjs'
let client
try {
  const config=loadConfig()
  if(!process.env.MCP_ACCESS_TOKEN_FILE)throw new Error('missing_access_token_file')
  const access=readFileSync(process.env.MCP_ACCESS_TOKEN_FILE,'utf8').trim()
  if(!access)throw new Error('missing_access_token')
  const unauth=await fetch(config.resource,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:'{}',signal:AbortSignal.timeout(15000),redirect:'error'})
  if(unauth.status!==401||!unauth.headers.get('www-authenticate')?.includes(config.metadataUrl))throw new Error('unauthorized_challenge_failed')
  const meta=await fetch(config.metadataUrl,{signal:AbortSignal.timeout(15000),redirect:'error'})
  const metadata=await meta.json()
  if(!meta.ok||metadata.resource!==config.resource||!metadata.authorization_servers.includes(config.issuer))throw new Error('discovery_failed')
  client=new Client({name:'training-mcp-live-acceptance',version:'2.2.0'})
  await client.connect(new StreamableHTTPClientTransport(new URL(config.resource),{requestInit:{headers:{Authorization:`Bearer ${access}`}}}))
  const {tools}=await client.listTools()
  if(tools.length!==3||tools.some(t=>t.annotations?.readOnlyHint!==true))throw new Error('tool_contract_failed')
  const direct=new TrainingReader(config)
  const asOf=new Date().toISOString()
  const expected=await direct.list({days:90,limit:1,asOf})
  if(!expected.sessions.length)throw new Error('no_existing_record_in_last_90_days')
  const result=await client.callTool({name:'list_recent_training',arguments:{days:90,limit:1,asOf}})
  if(result.isError||JSON.stringify(result.structuredContent.sessions)!==JSON.stringify(expected.sessions))throw new Error('upstream_comparison_failed')
  const session=expected.sessions[0]
  const exercise=await client.callTool({name:'list_exercise_history',arguments:{exercise:session.exercise,days:90,limit:1,asOf}})
  const expectedExercise=await direct.list({exercise:session.exercise,days:90,limit:1,asOf})
  if(exercise.isError||JSON.stringify(exercise.structuredContent.sessions)!==JSON.stringify(expectedExercise.sessions))throw new Error('exercise_comparison_failed')
  const detail=await client.callTool({name:'get_training_detail',arguments:{sessionId:session.id,recordLimit:1}})
  const directDetail=await direct.detail({sessionId:session.id,recordLimit:1})
  if(detail.isError||JSON.stringify(detail.structuredContent)!==JSON.stringify(directDetail))throw new Error('detail_comparison_failed')
  console.log(JSON.stringify({status:'passed',checks:['401 challenge','resource metadata','SDK handshake','3 read-only tools','existing record equality','exercise history equality','detail equality'],recordFingerprint:createHash('sha256').update(session.id).digest('hex').slice(0,12),checkedAt:new Date().toISOString(),chatgptUIVerified:false}))
} catch {
  // Do not print exception messages: upstream libraries can include HTTP headers and credentials.
  console.error('LIVE_ACCEPTANCE_NOT_PASSED: check server configuration, OAuth access token, network and existing cloud records. No records were written.');process.exitCode=2
} finally {await client?.close().catch(()=>{})}
