import type { HealthResponse, NodeMeta, StreamHandlers } from "../types";

export async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch("/api/health");
  if (!response.ok) throw new Error(`Health check failed: ${response.status}`);
  return response.json();
}

export async function fetchNodes(): Promise<NodeMeta[]> {
  const response = await fetch("/api/nodes");
  if (!response.ok) throw new Error(`Failed to load nodes: ${response.status}`);
  return response.json();
}

export async function fetchSeed(node: string): Promise<string | null> {
  const response = await fetch(`/api/seed/${node}`);
  if (!response.ok) return null;
  const data = await response.json();
  return data.html ?? null;
}

export async function fetchSeeds(node: string): Promise<string[]> {
  const response = await fetch(`/api/seeds/${node}`);
  if (!response.ok) return [];
  const data = await response.json();
  return data.seeds ?? [];
}

async function streamPost(
  path: string,
  body: unknown,
  handlers: StreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return;
    handlers.onError?.(String(e));
    return;
  }
  if (!response.ok || !response.body) {
    handlers.onError?.(`Request failed: ${response.status}`);
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    let value: Uint8Array | undefined;
    let done: boolean;
    try {
      ({ value, done } = await reader.read());
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      throw e;
    }
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const raw = buffer.slice(0, boundary).trim();
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf("\n\n");
      if (!raw.startsWith("data:")) continue;
      let evt: any;
      try {
        evt = JSON.parse(raw.slice(5).trim());
      } catch {
        continue;
      }
      if (evt.type === "meta") handlers.onMeta?.(evt.cached);
      else if (evt.type === "chunk") handlers.onChunk?.(evt.text);
      else if (evt.type === "done") handlers.onDone?.(evt.html, evt.cached, evt.ms, evt.tokens_used ?? null);
      else if (evt.type === "error") handlers.onError?.(evt.message);
    }
  }
}

export function streamGenerate(
  node: string,
  prompt: string,
  handlers: StreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  return streamPost("/api/generate", { node, prompt }, handlers, signal);
}

export function streamRepair(
  node: string,
  prompt: string,
  previousHtml: string,
  error: string,
  handlers: StreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  return streamPost(
    "/api/repair",
    { node, prompt, previous_html: previousHtml, error },
    handlers,
    signal,
  );
}
