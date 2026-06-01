export interface Chip {
  label: string;
  prompt: string;
}

export interface NodeMeta {
  id: string;
  title: string;
  blurb: string;
  chips: Chip[];
}

export interface HealthResponse {
  status: string;
  model_reachable: boolean;
  model_name: string;
  model_temperature: number;
  model_max_tokens: number;
}

export interface StreamHandlers {
  onMeta?: (cached: boolean) => void;
  onChunk?: (text: string) => void;
  onDone?: (html: string, cached: boolean, ms: number, tokensUsed: number | null) => void;
  onError?: (message: string) => void;
}
