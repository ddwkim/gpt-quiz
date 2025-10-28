export type NodeShape =
  | 'rect' | 'decision' | 'terminator' | 'io' | 'db'
  | 'subroutine' | 'stadium' | 'circle' | 'double_circle'
  | 'hexagon' | 'parallelogram' | 'trap';

export interface Evidence {
  role: 'user' | 'assistant';
  turn: number; start: number; end: number;
  quote?: string; confidence?: number; // 0..1
}

export interface IRNode {
  id: string;                // ^[A-Za-z_][A-Za-z0-9_]*$
  label: string;             // ASCII, ≤60 chars
  labelLines?: string[];     // Optional multiline segments (ASCII, ≤60 chars each)
  shape?: NodeShape;
  weight?: number;           // centrality hint
  group?: string;            // clustering hint
  evidence?: Evidence[];
}

export interface IREdge {
  from: string; to: string;
  label?: string;            // whitelist, ASCII, ≤30 chars
  kind?: 'causes'|'leads_to'|'computes'|'depends_on'|'configures'|'constrains'
       | 'reads_from'|'writes_to'|'validates'|'triggers'|'emits';
  evidence?: Evidence[];
}

export interface IRStyle {
  wrapLabelsAt?: number;
  nodeSpacing?: number;      // 50..120
  rankSpacing?: number;      // 50..120
  renderer?: 'dagre' | 'elk';
}

export interface IR {
  kind: 'flowchart';
  direction: 'TB'|'BT'|'LR'|'RL';
  nodes: IRNode[];
  edges: IREdge[];
  subgraphs?: { title: string; nodeIds: string[] }[];
  style?: IRStyle;
}
