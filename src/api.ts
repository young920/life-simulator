import type { LifePlan, LifeStats } from "./life";

const apiBase = `${window.location.protocol}//${window.location.hostname}:4174/api`;

export type ModelCatalog = {
  textModels: string[];
  imageModels: string[];
  videoModels: string[];
  otherModels: string[];
};

export type LifePlanInput = {
  world: string;
  worldLabel: string;
  era: string;
  identity: string;
  aspiration: string;
  name: string;
  traits: string;
  sourceTitle: string;
  castNotes: string;
  stats: LifeStats;
  modelChain: string[];
};

export type LifePlanResponse = {
  plan: LifePlan;
  modelUsed: string;
  attempts: Array<{ model: string; result: "success" | "failed"; status?: number | null; reason?: string }>;
};

export type LifePlanProgress = {
  stage: string;
  model?: string;
  nextModel?: string;
  attempt?: number;
  total?: number;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
    signal: init?.signal || AbortSignal.timeout(180_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || `API request failed (${response.status}).`);
    Object.assign(error, { status: response.status, attempts: payload.attempts || [] });
    throw error;
  }
  return payload as T;
}

export function loadModelCatalog() {
  return request<ModelCatalog>("/models");
}

export function createLifePlan(input: LifePlanInput, signal?: AbortSignal, onProgress?: (progress: LifePlanProgress) => void) {
  return createLifePlanWithProgress(input, signal, onProgress);
}

export async function createLifePlanWithProgress(input: LifePlanInput, signal?: AbortSignal, onProgress?: (progress: LifePlanProgress) => void) {
  const response = await fetch(`${apiBase}/life-plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify(input),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(240_000)]) : AbortSignal.timeout(240_000),
  });

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/event-stream")) {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error || `API request failed (${response.status}).`);
      Object.assign(error, { status: response.status, attempts: payload.attempts || [] });
      throw error;
    }
    return payload as LifePlanResponse;
  }

  if (!response.ok || !response.body) throw new Error(`API request failed (${response.status}).`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: LifePlanResponse | null = null;

  const dispatch = (block: string) => {
    let event = "message";
    const data: string[] = [];
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
    }
    if (!data.length) return;
    const payload = JSON.parse(data.join("\n"));
    if (event === "progress") onProgress?.(payload as LifePlanProgress);
    if (event === "complete") result = payload.result as LifePlanResponse;
    if (event === "error") {
      const error = new Error(payload.error || "人生方案生成失败。");
      Object.assign(error, { status: payload.status, attempts: payload.attempts || [] });
      throw error;
    }
  };

  try {
    while (!result) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      let boundary = buffer.search(/\r?\n\r?\n/);
      while (boundary >= 0) {
        const block = buffer.slice(0, boundary);
        const separator = buffer.slice(boundary).match(/^\r?\n\r?\n/)?.[0] || "\n\n";
        buffer = buffer.slice(boundary + separator.length);
        dispatch(block);
        if (result) break;
        boundary = buffer.search(/\r?\n\r?\n/);
      }
      if (done) {
        if (buffer.trim()) dispatch(buffer);
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }
  if (!result) throw new Error("推演连接中断，请重试。");
  return result;
}

export function testModelChain(modelChain: string[]) {
  return request<{ success: boolean; modelUsed?: string; attempts: Array<{ model: string; result: string; status?: number | null }> }>("/test-model-chain", {
    method: "POST",
    body: JSON.stringify({ modelChain }),
    signal: AbortSignal.timeout(90_000),
  });
}

export function generateEventImage(prompt: string, options: { signal?: AbortSignal; ratio?: "1:1" | "3:4" | "4:3" | "9:16" | "16:9" } = {}) {
  return request<{ modelUsed: string; url: string | null; dataUrl: string | null; attempts: Array<{ model: string; result: string; status?: number | null }> }>("/image", {
    method: "POST",
    body: JSON.stringify({ prompt, size: "1K", ratio: options.ratio || "4:3" }),
    signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(180_000)]) : AbortSignal.timeout(180_000),
  });
}
