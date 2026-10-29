// by saurus

const https = require('https')
const crypto = require('crypto')
const readline = require('readline')

const keepAgent = new https.Agent({ keepAlive: true })
const CHAT_BASE = 'https://chatgpt.com'
const MODEL_ID = 'auto'
const LANG_CODE = 'id-ID'
const UA_STRING = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Mobile Safari/537.36'

const newId = () => crypto.randomUUID()

function mergeCookies(store, setCookies) {
  if (!setCookies) return
  const arr = Array.isArray(setCookies) ? setCookies : [setCookies]
  for (const raw of arr) {
    const first = raw.split(';')[0]
    const eq = first.indexOf('=')
    if (eq > 0) store[first.slice(0, eq).trim()] = first.slice(eq + 1).trim()
  }
}

const cookieHeader = (store) =>
  Object.keys(store).map((k) => `${k}=${store[k]}`).join('; ')

function httpCall(url, { method = 'GET', headers = {}, body = null, stream = false } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const finalHeaders = body
      ? { ...headers, 'content-length': Buffer.byteLength(body) }
      : { ...headers }

    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method,
        headers: finalHeaders,
        agent: keepAgent,
        maxHeaderSize: 1048576,
      },
      (res) => {
        if (stream) return resolve({ res, headers: res.headers, status: res.statusCode })
        const acc = []
        res.on('data', (c) => acc.push(c))
        res.on('end', () =>
          resolve({
            text: Buffer.concat(acc).toString(),
            headers: res.headers,
            status: res.statusCode,
          })
        )
      }
    )
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}

function hashFnv(input) {
  let h = 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  h ^= h >>> 16
  h = Math.imul(h, 2246822507) >>> 0
  h ^= h >>> 13
  h = Math.imul(h, 3266489909) >>> 0
  h ^= h >>> 16
  return (h >>> 0).toString(16).padStart(8, '0')
}

const toB64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64')

function buildEnv(w, h, ua, build, lang) {
  const env = new Array(26).fill(0)
  env[0] = w + h
  env[1] = String(new Date())
  env[2] = 2172649472
  env[3] = 0
  env[4] = ua
  env[5] = null
  env[6] = build
  env[7] = lang
  env[8] = `${lang},en`
  env[9] = 0
  env[10] = 'contacts\u2212[object ContactsManager]'
  env[11] = '_reactListening'
  env[12] = 'User'
  env[13] = performance.now()
  env[14] = crypto.randomUUID()
  env[15] = ''
  env[16] = 8
  env[17] = performance.timeOrigin
  return env
}

function solvePow(seed, target, env) {
  const t0 = performance.now()
  for (let i = 0; i < 500000; i++) {
    env[3] = i
    env[9] = Math.round(performance.now() - t0)
    const enc = toB64(env)
    if (hashFnv(seed + enc).substring(0, target.length) <= target) {
      return 'gAAAAAB' + enc + '~S'
    }
  }
  return 'wQ8Lk5FbGpA2NcR9dShT6gYjU7VxZ4De'
}

async function bootstrap(preCookie) {
  const cookies = {}
  const deviceId = crypto.randomUUID()
  let buildNum = null

  const home = await httpCall(CHAT_BASE + '/', {
    method: 'GET',
    headers: {
      'User-Agent': UA_STRING,
      accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'accept-language': `${LANG_CODE},en-US;q=0.9,en;q=0.8`,
    },
  })

  const pickers = [
    /["']buildNumber["']\s*:\s*["']([^"']+)["']/,
    /buildNumber\s*=\s*["']([^"']+)["']/,
    /BUILD_NUMBER\s*["']([^"']+)["']/,
    /["']version["']\s*:\s*["']([^"']+)["']/,
    /["']appVersion["']\s*:\s*["']([^"']+)["']/,
    /["']build["']\s*:\s*["']([^"']+)["']/,
    /prod-([a-f0-9]+)/,
  ]
  for (const rx of pickers) {
    const hit = home.text.match(rx)
    if (hit && hit[1]) {
      buildNum = hit[1]
      break
    }
  }

  if (preCookie) {
    for (const part of preCookie.split(';')) {
      const eq = part.indexOf('=')
      if (eq > 0) cookies[part.slice(0, eq).trim()] = part.slice(eq + 1).trim()
    }
  }

  const headers = {
    'User-Agent': UA_STRING,
    accept: '*/*',
    'accept-language': `${LANG_CODE},en-US;q=0.9,en;q=0.8`,
    'content-type': 'application/json',
    'OAI-Device-Id': deviceId,
    'sec-ch-ua': '"Chromium";v="144", "Not/A)Brand";v="24"',
    'sec-ch-ua-mobile': '?1',
    'sec-ch-ua-platform': '"Android"',
    origin: CHAT_BASE,
    referer: CHAT_BASE + '/',
    ...(Object.keys(cookies).length ? { cookie: cookieHeader(cookies) } : {}),
  }

  return {
    cookies,
    headers,
    userAgent: UA_STRING,
    deviceId,
    buildNumber: buildNum,
    lang: LANG_CODE,
    screenWidth: 423,
    screenHeight: 965,
  }
}

async function makeSentinel(auth) {
  const cfg = buildEnv(auth.screenWidth, auth.screenHeight, auth.userAgent, auth.buildNumber, auth.lang)
  cfg[3] = 1
  cfg[9] = 0

  const prepRes = await httpCall(CHAT_BASE + '/backend-anon/sentinel/chat-requirements/prepare', {
    method: 'POST',
    headers: auth.headers,
    body: JSON.stringify({ p: 'gAAAAAC' + toB64(cfg) }),
  })
  const prep = JSON.parse(prepRes.text)

  let proof = null
  if (prep.proofofwork?.required) {
    proof = solvePow(
      prep.proofofwork.seed,
      prep.proofofwork.difficulty,
      buildEnv(auth.screenWidth, auth.screenHeight, auth.userAgent, auth.buildNumber, auth.lang)
    )
  }

  const turnstile = crypto.randomBytes(Math.floor((2256 / 4) * 3)).toString('base64').slice(0, 2256)

  const finBody = { prepare_token: prep.prepare_token ?? '' }
  if (proof) finBody.proofofwork = proof
  if (turnstile) finBody.turnstile = turnstile

  const finRes = await httpCall(CHAT_BASE + '/backend-anon/sentinel/chat-requirements/finalize', {
    method: 'POST',
    headers: auth.headers,
    body: JSON.stringify(finBody),
  })
  const fin = JSON.parse(finRes.text)

  return { proof, turnstile, reqToken: fin.token ?? null }
}

async function acquireConduit(prompt, msgId, auth, { conversationId, parentMsgId, webSearch } = {}) {
  const parent = parentMsgId || 'client-created-root'
  const payload = {
    action: 'next',
    fork_from_shared_post: false,
    parent_message_id: parent,
    model: MODEL_ID,
    timezone_offset_min: new Date().getTimezoneOffset(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    conversation_mode: { kind: 'primary_assistant' },
    system_hints: webSearch ? ['search'] : [],
    supports_buffering: true,
    supported_encodings: ['v1'],
    partial_query: {
      id: msgId,
      author: { role: 'user' },
      content: { content_type: 'text', parts: [prompt] },
    },
    client_contextual_info: { app_name: 'chatgpt.com' },
  }
  if (conversationId) payload.conversation_id = conversationId

  const res = await httpCall(CHAT_BASE + '/backend-anon/f/conversation/prepare', {
    method: 'POST',
    headers: { ...auth.headers, 'X-Conduit-Token': 'no-token' },
    body: JSON.stringify(payload),
  })
  const data = JSON.parse(res.text)
  return data.token || data.conduit_token
}

function composeBody(prompt, msgId, auth, { conversationId, parentMsgId, webSearch } = {}) {
  const parent = parentMsgId || 'client-created-root'
  const content = { content_type: 'text', parts: [prompt] }
  const meta = {
    selected_github_repos: [],
    selected_all_github_repos: false,
    serialization_metadata: { custom_symbol_offsets: [] },
    ...(webSearch ? { system_hints: ['search'] } : {}),
  }

  const body = {
    action: 'next',
    messages: [
      {
        id: msgId,
        author: { role: 'user' },
        create_time: Date.now() / 1000,
        content,
        metadata: meta,
      },
    ],
    parent_message_id: parent,
    model: MODEL_ID,
    timezone_offset_min: new Date().getTimezoneOffset(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    conversation_mode: { kind: 'primary_assistant' },
    enable_message_followups: true,
    system_hints: webSearch ? ['search'] : [],
    supports_buffering: true,
    supported_encodings: ['v1'],
    client_contextual_info: {
      is_dark_mode: true,
      time_since_loaded: 10,
      page_height: 845,
      page_width: 423,
      pixel_ratio: 1.7,
      screen_height: auth.screenHeight,
      screen_width: auth.screenWidth,
      app_name: 'chatgpt.com',
    },
    no_auth_ad_preferences: { personalization_enabled: true, history_enabled: true },
    paragen_cot_summary_display_override: 'allow',
    force_parallel_switch: 'auto',
  }
  if (conversationId) body.conversation_id = conversationId
  if (webSearch) {
    body.force_use_search = true
    body.client_reported_search_source = 'conversation_composer_web_icon'
  }
  return body
}

function readSSE(buf) {
  const out = []
  for (const line of buf.split('\n')) {
    if (!line.startsWith('data:')) continue
    const raw = line.slice(5).trim()
    if (!raw || raw === '[DONE]') continue
    try {
      out.push(JSON.parse(raw))
    } catch {}
  }
  return out
}

async function talk(prompt, auth, chatId, parentMsgId, opts = {}) {
  const { webSearch = false, stream = false, onChunk = null } = opts
  if (!prompt?.trim()) throw new Error('Pesan kosong.')

  const msgId = newId()
  const parent = parentMsgId || 'client-created-root'

  const [sentinel, conduit] = await Promise.all([
    makeSentinel(auth),
    acquireConduit(prompt, msgId, auth, { conversationId: chatId, parentMsgId: parent, webSearch }),
  ])

  const body = composeBody(prompt, msgId, auth, {
    conversationId: chatId,
    parentMsgId: parent,
    webSearch,
  })

  const headers = {
    ...auth.headers,
    accept: 'text/event-stream',
    'OAI-Language': auth.lang,
    'OpenAI-Sentinel-Chat-Requirements-Token': sentinel.reqToken,
    'OpenAI-Sentinel-Turnstile-Token': sentinel.turnstile,
    'OpenAI-Sentinel-Proof-Token': sentinel.proof,
    'X-Conduit-Token': conduit,
  }

  const { res, headers: resHeaders } = await httpCall(CHAT_BASE + '/backend-anon/f/conversation', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    stream: true,
  })

  mergeCookies(auth.cookies, resHeaders['set-cookie'])

  return new Promise((resolve, reject) => {
    let acc = ''
    let title = null
    let model = null
    let conv = null
    let assistantId = null
    let tail = ''

    res.on('data', (chunk) => {
      try {
        tail += chunk.toString('utf8')
        const blocks = tail.split('\n\n')
        tail = blocks.pop() || ''

        for (const blk of blocks) {
          for (const json of readSSE(blk)) {
            if (json.conversation_id) conv = json.conversation_id
            else if (json.v?.conversation_id) conv = json.v.conversation_id

            if (json.v && !Array.isArray(json.v) && json.v.message?.author?.role === 'assistant' && json.v.message?.id) {
              assistantId = json.v.message.id
            }
            if (json.type === 'title_generation') title = json.title
            if (json.type === 'server_ste_metadata') model = json.metadata?.model_slug || null

            const patches = Array.isArray(json.v) ? json.v : []
            for (const p of patches) {
              if (p.o === 'append' && p.p?.includes('/message/content/parts/0')) {
                acc += p.v
                if (stream && typeof onChunk === 'function') onChunk(p.v)
              }
            }
          }
        }
      } catch (err) {
        reject(err)
      }
    })

    res.on('end', () =>
      resolve({ text: acc, title, model, conversationId: conv, messageId: assistantId, auth })
    )
    res.on('error', reject)
  })
}

async function main() {
  const auth = await bootstrap()
  console.log('session siap\n')

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const ask = (q) => new Promise((r) => rl.question(q, r))

  let convId = null
  let parentId = null
  let useSearch = false

  console.log('perintah: /new  /search  /exit')
  console.log('ketik pesan untuk chat biasa\n')

  while (true) {
    const line = (await ask('you: ')).trim()
    if (!line) continue

    if (line === '/exit') break
    if (line === '/new') {
      convId = null
      parentId = null
      console.log('[conversation baru]\n')
      continue
    }
    if (line === '/search') {
      useSearch = !useSearch
      console.log(`[web search: ${useSearch ? 'on' : 'off'}]\n`)
      continue
    }

    try {
      process.stdout.write('bot: ')
      const res = await talk(line, auth, convId, parentId, {
        webSearch: useSearch,
        stream: true,
        onChunk: (t) => process.stdout.write(t),
      })
      process.stdout.write('\n')
      convId = res.conversationId
      parentId = res.messageId
      if (res.model) console.log(`[model: ${res.model}]`)
      console.log('')
    } catch (err) {
      console.log('\n[error]', err.message, '\n')
    }
  }

  rl.close()
}

if (require.main === module) main()
