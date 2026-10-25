import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envFile = resolve(projectRoot, ".env.local");

function loadEnvFile() {
  try {
    for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!match || line.trimStart().startsWith("#") || process.env[match[1]]) continue;
      process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
    }
  } catch {
    // Config is checked per endpoint so the server can still show a useful health response.
  }
}

loadEnvFile();

const port = Number(process.env.API_PORT || 4174);
const allowedOrigins = new Set(["http://localhost:4173", "http://127.0.0.1:4173"]);
const MAX_BODY_BYTES = 160_000;
const MODEL_CACHE_MS = 60_000;
let modelCache = null;
let modelCacheTime = 0;

function sendJson(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  response.end(body);
}

function sendSseEvent(response, event, payload) {
  if (response.destroyed || response.writableEnded) return;
  response.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
}

function setCors(request, response) {
  const origin = request.headers.origin;
  if (origin && allowedOrigins.has(origin)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
  }
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

async function readJson(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error("Request body is too large."), { status: 413 });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw Object.assign(new Error("Request body must be valid JSON."), { status: 400 });
  }
}

function assertTextConfig() {
  const base = process.env.MODEL_BASE_URL?.trim();
  const key = process.env.MODEL_API_KEY?.trim();
  if (!base || !key) throw Object.assign(new Error("Text model API is not configured."), { status: 503 });
  return { base: base.replace(/\/+$/, ""), key };
}

function assertAgnesConfig() {
  const base = process.env.AGNES_BASE_URL?.trim() || "https://apihub.agnes-ai.com/v1";
  const key = process.env.AGNES_API_KEY?.trim();
  if (!key) throw Object.assign(new Error("Image model API is not configured."), { status: 503 });
  return { base: base.replace(/\/+$/, ""), key };
}

function versionedBase(base) {
  return /\/v\d+$/.test(base) ? base : `${base}/v1`;
}

async function fetchModelIds(base, key) {
  const response = await fetch(`${versionedBase(base)}/models`, {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw Object.assign(new Error("Model catalog request failed."), { status: response.status });
  const payload = await response.json();
  const records = Array.isArray(payload.data) ? payload.data : Array.isArray(payload.models) ? payload.models : [];
  return records.map((model) => (typeof model === "string" ? model : model?.id || model?.name)).filter(Boolean);
}

async function getModelCatalog(force = false) {
  if (!force && modelCache && Date.now() - modelCacheTime < MODEL_CACHE_MS) return modelCache;
  const textConfig = assertTextConfig();
  const textIds = await fetchModelIds(textConfig.base, textConfig.key);
  const textModels = textIds.filter((id) => !/(embedding|image|video|hailuo|audio|speech|tts)/i.test(id));
  let agnesImages = [];
  let agnesVideos = [];
  try {
    const agnesConfig = assertAgnesConfig();
    const ids = await fetchModelIds(agnesConfig.base, agnesConfig.key);
    agnesImages = ids.filter((id) => /image/i.test(id));
    agnesVideos = ids.filter((id) => /video/i.test(id));
  } catch {
    // The text catalog remains useful if the image provider is temporarily unavailable.
  }
  modelCache = {
    textModels,
    imageModels: agnesImages,
    videoModels: agnesVideos,
    otherModels: textIds.filter((id) => !textModels.includes(id)),
  };
  modelCacheTime = Date.now();
  return modelCache;
}

function parseModelText(payload) {
  const message = payload?.choices?.[0]?.message;
  const content = message?.content;
  if (typeof content === "string" && content.trim()) return content.trim();
  if (Array.isArray(content)) {
    const combined = content.map((part) => part?.text || "").join("\n").trim();
    if (combined) return combined;
  }
  throw new Error("Model returned an empty answer.");
}

async function callChatModel(model, messages, signal, onText) {
  const { base, key } = assertTextConfig();
  const response = await fetch(`${versionedBase(base)}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.3,
      max_tokens: 6_500,
      stream: Boolean(onText),
      response_format: { type: "json_object" },
    }),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(45_000)]) : AbortSignal.timeout(45_000),
  });
  if (!response.ok) throw Object.assign(new Error("Model request failed."), { status: response.status });
  if (onText && response.headers.get("content-type")?.includes("text/event-stream")) {
    return readChatCompletionStream(response, onText);
  }
  const payload = await response.json().catch(() => ({}));
  const text = parseModelText(payload);
  onText?.(text);
  return text;
}

async function readChatCompletionStream(response, onText) {
  if (!response.body) throw new Error("Streaming response body was empty.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";

  const consume = (block) => {
    const data = block.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
    if (!data || data === "[DONE]") return;
    let payload;
    try { payload = JSON.parse(data); } catch { return; }
    if (payload.error) throw new Error(String(payload.error.message || payload.error));
    const content = payload.choices?.[0]?.delta?.content;
    const chunk = typeof content === "string" ? content : Array.isArray(content) ? content.map((part) => part?.text || "").join("") : "";
    if (!chunk) return;
    text += chunk;
    onText(text);
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      let boundary = buffer.search(/\r?\n\r?\n/);
      while (boundary >= 0) {
        const block = buffer.slice(0, boundary);
        const separator = buffer.slice(boundary).match(/^\r?\n\r?\n/)?.[0] || "\n\n";
        buffer = buffer.slice(boundary + separator.length);
        consume(block);
        boundary = buffer.search(/\r?\n\r?\n/);
      }
      if (done) break;
    }
    if (buffer.trim()) consume(buffer);
  } finally {
    reader.releaseLock();
  }
  if (!text.trim()) throw new Error("Model returned an empty answer.");
  return text.trim();
}

function lifePlanStageFromText(text) {
  const stages = { worldSummary: "world", characters: "characters", events: "events", relationshipEffects: "relationships", memories: "memories" };
  const fieldPattern = /(?:^|[,{])\s*"(worldSummary|characters|events|relationshipEffects|memories)"\s*:/g;
  let match;
  let latestPosition = -1;
  let latestStage = null;
  while ((match = fieldPattern.exec(text)) !== null) {
    if (match.index > latestPosition) {
      latestPosition = match.index;
      latestStage = stages[match[1]];
    }
  }
  return latestStage;
}

function extractJson(text) {
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Model reply did not contain a JSON object.");
  return JSON.parse(cleaned.slice(start, end + 1));
}

function normalizeLifePlan(raw, input) {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.events) || !Array.isArray(raw.characters)) {
    throw new Error("Model reply did not include events and characters.");
  }
  if (raw.events.length < 5 || raw.events.length > 20) throw new Error("Model reply had an invalid event count.");
  const characters = raw.characters.slice(0, 8).map((person, index) => ({
    id: String(person.id || `person-${index + 1}`).slice(0, 50),
    name: String(person.name || `相遇的人 ${index + 1}`).slice(0, 40),
    role: String(person.role || "重要的人").slice(0, 40),
    description: String(person.description || "").slice(0, 180),
    firstMeetAge: Math.min(100, Math.max(0, Number(person.firstMeetAge) || 0)),
  }));
  const characterIds = new Set(characters.map((person) => person.id));
  const events = raw.events.map((event, index) => {
    const age = Number(event.age);
  if (!Number.isInteger(age) || age < 1 || age >= 100) throw new Error("Model reply included an invalid event age.");
    if (!Array.isArray(event.choices) || event.choices.length < 2) throw new Error("Each event needs at least two choices.");
    return {
      id: String(event.id || `event-${index + 1}`).slice(0, 50),
      age,
      stage: String(event.stage || "人生片段").slice(0, 30),
      title: String(event.title || "命运的岔路").slice(0, 60),
      narrative: String(event.narrative || "").slice(0, 900),
      imagePrompt: String(event.imagePrompt || "").slice(0, 500),
      characterIds: Array.isArray(event.characterIds) ? event.characterIds.map(String).filter((id) => characterIds.has(id)).slice(0, 5) : [],
      choices: event.choices.slice(0, 3).map((choice) => ({
        label: String(choice.label || "继续前行").slice(0, 120),
        consequence: String(choice.consequence || "你的选择会留在这一生里。").slice(0, 180),
        effects: Object.fromEntries(["health", "intelligence", "charm", "wealth", "happiness"].map((key) => [key, Math.max(-15, Math.min(15, Number(choice.effects?.[key]) || 0))])),
        relationshipEffects: Object.fromEntries(Object.entries(choice.relationshipEffects || {}).filter(([id]) => characterIds.has(id)).map(([id, value]) => [id, Math.max(-20, Math.min(20, Number(value) || 0))])),
      })),
    };
  }).sort((a, b) => a.age - b.age);
  const eventAges = new Set(events.map((event) => event.age));
  if (eventAges.size !== events.length) throw new Error("Model reply included duplicate event ages.");
  const seenMemoryAges = new Set();
  const expectedMemoryAges = [1, 3, 6, 10, 12, 15, 21, 24, 27, 35, 40, 45, 55, 60, 70, 80, 85, 95];
  const expectedMemoryAgeSet = new Set(expectedMemoryAges);
  const memories = (Array.isArray(raw.memories) ? raw.memories : []).slice(0, 100).map((memory, index) => ({
    id: String(memory.id || `memory-${index + 1}`).slice(0, 50),
    age: Number(memory.age),
    title: String(memory.title || "这一年的记忆").slice(0, 50),
    narrative: String(memory.narrative || "").slice(0, 260),
    highlight: String(memory.highlight || memory.title || "留下这一年的记忆").slice(0, 36),
  })).filter((memory) => {
    const valid = Number.isInteger(memory.age) && expectedMemoryAgeSet.has(memory.age) && memory.age < 100 && memory.narrative.length >= 12 && !eventAges.has(memory.age) && !seenMemoryAges.has(memory.age);
    if (valid) seenMemoryAges.add(memory.age);
    return valid;
  }).sort((a, b) => a.age - b.age).slice(0, 18);
  if (expectedMemoryAges.some((age) => !seenMemoryAges.has(age))) throw new Error("Model reply did not include all annual memory ages.");
  return {
    worldSummary: String(raw.worldSummary || `${input.era} · ${input.worldLabel}`).slice(0, 500),
    openingLine: String(raw.openingLine || "你的人生从今天开始。").slice(0, 220),
    characters,
    events,
    memories,
    endingLine: String(raw.endingLine || "你曾经走过的路，构成了此生的答案。").slice(0, 250),
  };
}

function validatePlanInput(input) {
  if (!input || typeof input !== "object") throw Object.assign(new Error("Invalid life plan input."), { status: 400 });
  const world = String(input.world || "").trim();
  if (world.length < 8 || world.length > 1_200) throw Object.assign(new Error("World description must be 8–1200 characters."), { status: 400 });
  const modelChain = Array.isArray(input.modelChain) ? input.modelChain.slice(0, 5).map(String) : [];
  if (!modelChain.length) throw Object.assign(new Error("Choose at least one text model."), { status: 400 });
  const uniqueChain = [...new Set(modelChain)];
  const sourceTitle = String(input.sourceTitle || "").trim().slice(0, 100);
  const castNotes = String(input.castNotes || "").trim().slice(0, 1_200);
  return {
    world,
    worldLabel: String(input.worldLabel || "自定义世界").slice(0, 50),
    era: String(input.era || "现代").slice(0, 40),
    identity: String(input.identity || "普通人").slice(0, 40),
    aspiration: String(input.aspiration || "").slice(0, 80),
    name: String(input.name || "无名氏").slice(0, 40),
    traits: String(input.traits || "").slice(0, 180),
    sourceTitle,
    castNotes,
    stats: Object.fromEntries(["health", "intelligence", "charm", "wealth", "happiness"].map((key) => [key, Math.max(0, Math.min(100, Number(input.stats?.[key]) || 50))])),
    modelChain: uniqueChain,
  };
}

function buildLifePrompt(input) {
  const system = [
    "按玩家设定写原创人生，使用简体中文，只输出一个 JSON 对象，不要解释或复刻既有作品。",
    "结构：{worldSummary,openingLine,endingLine,characters:[{id,name,role,description,firstMeetAge}],events:[{id,age,stage,title,narrative,imagePrompt,characterIds,choices:[{label,consequence,effects:{health,intelligence,charm,wealth,happiness},relationshipEffects:{角色id:数值}}]}],memories:[{id,age,title,narrative,highlight}]}。",
    "恰好 5 个事件，年龄 8、18、30、50、75；出生写在 openingLine。生成 2 位角色，首次登场年龄与事件相符。每个事件恰好 2 个选择。文本简短。",
    "再生成 18 段年度记忆，年龄分别为 1、3、6、10、12、15、21、24、27、35、40、45、55、60、70、80、85、95；不要与关键事件同岁。每段 narrative 写 60-100 个汉字，写成小说里的具体片段：明确的人物行动、地点/物件、当下处境和情绪变化；前后有因果，随年龄成长，彼此不要重复。不要只写抽象感悟，不要假设玩家在其他关键节点一定做了哪种选择；只引用玩家设定中的人物。每段 highlight 用 10-18 个汉字概括本年最值得记住的一件事。它们是叙事卡片，不提供选项。",
    "所有设定都要影响故事。属性和关系变化为 -8 到 8 的整数。故事包含挫折和关系转折。角色只能在相遇后出现在事件中。插画提示简短且准确匹配当前事件，用二维动漫电影插画描述，不写摄影写实，不写惊悚怪脸或血腥元素，不含文字。",
  ].join("\n");
  const user = {
    world: input.world,
    sourceTitle: input.sourceTitle,
    castNotes: input.castNotes,
    era: input.era,
    identity: input.identity,
    aspiration: input.aspiration,
    protagonist: input.name,
    traits: input.traits,
    startingStats: input.stats,
  };
  return [
    { role: "system", content: system },
    { role: "user", content: `请根据以下人生设定生成完整的一局：\n${JSON.stringify(user)}` },
  ];
}

async function generateLifePlan(input, signal, onProgress = () => {}) {
  onProgress({ stage: "catalog" });
  signal?.throwIfAborted();
  const catalog = await getModelCatalog();
  signal?.throwIfAborted();
  const allowed = new Set(catalog.textModels);
  const chain = input.modelChain.filter((model) => allowed.has(model));
  if (!chain.length) throw Object.assign(new Error("None of the selected models is available for text generation."), { status: 400 });
  const messages = buildLifePrompt(input);
  const attempts = [];
  for (let index = 0; index < chain.length; index += 1) {
    const model = chain[index];
    signal?.throwIfAborted();
    onProgress({ stage: "model", model, attempt: index + 1, total: chain.length });
    let lastStreamStage = "";
    try {
      const text = await callChatModel(model, messages, signal, (partialText) => {
        const stage = lifePlanStageFromText(partialText);
        if (stage && stage !== lastStreamStage) {
          lastStreamStage = stage;
          onProgress({ stage, model, attempt: index + 1, total: chain.length });
        }
      });
      onProgress({ stage: "validating", model, attempt: index + 1, total: chain.length });
      const plan = normalizeLifePlan(extractJson(text), input);
      onProgress({ stage: "complete", model, attempt: index + 1, total: chain.length });
      return { plan, modelUsed: model, attempts: [...attempts, { model, result: "success" }] };
    } catch (error) {
      if (signal?.aborted) throw error;
      attempts.push({ model, result: "failed", status: Number(error.status) || null, reason: String(error.message || "Model failed").slice(0, 120) });
      if (index + 1 < chain.length) onProgress({ stage: "fallback", model, nextModel: chain[index + 1], attempt: index + 1, total: chain.length });
    }
  }
  throw Object.assign(new Error("All selected text models failed."), { status: 502, attempts });
}

async function generateImage(input) {
  const { base, key } = assertAgnesConfig();
  const modelIds = [process.env.AGNES_IMAGE_MODEL || "agnes-image-2.5-flash", "agnes-image-2.1-flash"];
  const prompt = String(input?.prompt || "").trim();
  if (prompt.length < 8 || prompt.length > 1_200) throw Object.assign(new Error("Image prompt must be 8–1200 characters."), { status: 400 });
  const safeBase = versionedBase(base);
  const attempts = [];
  for (const model of [...new Set(modelIds)]) {
    try {
      const response = await fetch(`${safeBase}/images/generations`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          prompt,
          size: input?.size === "2K" ? "2K" : "1K",
          ratio: ["1:1", "3:4", "4:3", "9:16", "16:9"].includes(input?.ratio) ? input.ratio : "4:3",
          n: 1,
          extra_body: { response_format: "url" },
        }),
        signal: AbortSignal.timeout(120_000),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw Object.assign(new Error("Image model request failed."), { status: response.status });
      const asset = payload.data?.[0];
      if (!asset?.url && !asset?.b64_json) throw new Error("Image provider returned no image.");
      return { modelUsed: model, url: asset.url || null, dataUrl: asset.b64_json ? `data:image/png;base64,${asset.b64_json}` : null, attempts: [...attempts, { model, result: "success" }] };
    } catch (error) {
      attempts.push({ model, result: "failed", status: Number(error.status) || null });
    }
  }
  throw Object.assign(new Error("All configured image models failed."), { status: 502, attempts });
}

async function respond(request, response) {
  const url = new URL(request.url || "/", "http://127.0.0.1");
  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }
  if (request.method === "GET" && url.pathname === "/api/health") {
    sendJson(response, 200, { ok: true, textConfigured: Boolean(process.env.MODEL_API_KEY && process.env.MODEL_BASE_URL), imageConfigured: Boolean(process.env.AGNES_API_KEY) });
    return;
  }
  if (request.method === "GET" && url.pathname === "/api/models") {
    try {
      sendJson(response, 200, await getModelCatalog(url.searchParams.get("refresh") === "1"));
    } catch (error) {
      sendJson(response, Number(error.status) || 502, { error: "Could not load model catalog." });
    }
    return;
  }
  try {
    if (request.method !== "POST") {
      sendJson(response, 405, { error: "Method not allowed." });
      return;
    }
    const body = await readJson(request);
    if (url.pathname === "/api/life-plan") {
      const input = validatePlanInput(body);
      const controller = new AbortController();
      const cancelIfDisconnected = () => { if (!response.writableEnded) controller.abort(); };
      response.once("close", cancelIfDisconnected);
      try {
        if ((request.headers.accept || "").includes("text/event-stream")) {
          response.writeHead(200, {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
          });
          response.flushHeaders?.();
          sendSseEvent(response, "progress", { stage: "starting" });
          try {
            const result = await generateLifePlan(input, controller.signal, (progress) => sendSseEvent(response, "progress", progress));
            if (!response.destroyed) {
              sendSseEvent(response, "complete", { result });
              response.end();
            }
          } catch (error) {
            if (!response.destroyed) {
              sendSseEvent(response, "error", {
                error: String(error.message || "Request failed."),
                status: Number(error.status) || null,
                attempts: Array.isArray(error.attempts) ? error.attempts : [],
              });
              response.end();
            }
          }
        } else {
          const result = await generateLifePlan(input, controller.signal);
          if (!response.destroyed) sendJson(response, 200, result);
        }
      } finally {
        response.off("close", cancelIfDisconnected);
      }
      return;
    }
    if (url.pathname === "/api/image") {
      sendJson(response, 200, await generateImage(body));
      return;
    }
    if (url.pathname === "/api/test-model-chain") {
      const input = validatePlanInput({ ...body, world: String(body.world || "测试世界，测试一次模型连通性。"), modelChain: body.modelChain });
      const catalog = await getModelCatalog();
      const allowed = new Set(catalog.textModels);
      const chain = input.modelChain.filter((model) => allowed.has(model));
      const attempts = [];
      for (const model of chain) {
        try {
          const text = await callChatModel(model, [{ role: "user", content: "只回复 OK。" }]);
          if (!text.trim()) throw new Error("Empty response");
          attempts.push({ model, result: "success" });
          sendJson(response, 200, { success: true, modelUsed: model, attempts });
          return;
        } catch (error) {
          attempts.push({ model, result: "failed", status: Number(error.status) || null });
        }
      }
      sendJson(response, 502, { success: false, attempts });
      return;
    }
    sendJson(response, 404, { error: "Not found." });
  } catch (error) {
    if (response.destroyed) return;
    const status = Number(error.status) || 500;
    const payload = { error: status >= 500 ? "Request failed." : String(error.message || "Invalid request.") };
    if (Array.isArray(error.attempts)) payload.attempts = error.attempts;
    sendJson(response, status, payload);
  }
}

const server = createServer((request, response) => {
  const origin = request.headers.origin;
  if (origin === "http://localhost:4173" || origin === "http://127.0.0.1:4173") {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }
  respond(request, response).catch(() => {
    if (!response.headersSent) sendJson(response, 500, { error: "Request failed." });
    else response.destroy();
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Life API server listening on http://127.0.0.1:${port}`);
  console.log(`Text API configured: ${Boolean(process.env.MODEL_API_KEY && process.env.MODEL_BASE_URL)}`);
  console.log(`Image API configured: ${Boolean(process.env.AGNES_API_KEY)}`);
});
