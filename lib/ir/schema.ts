export type NodeShape = 'rect' | 'decision' | 'terminator';

export interface Evidence {
  role: 'user' | 'assistant';
  turn: number; start: number; end: number;
  quote?: string; confidence?: number; // 0..1
}

export interface IRNodeBridge {
  toDiagram: number;
  targetLabel: string;
}

export interface IRNode {
  id: string;                        // ^[A-Za-z_][A-Za-z0-9_]*$
  label?: string;                    // Optional; compiler prefers labelLines
  labelLines?: string[];             // Sanitized segments (ASCII, ≤60 chars each)
  shape?: NodeShape;
  weight?: number;                   // centrality hint
  group?: string;                    // clustering hint
  evidence?: Evidence[];
  bridge?: IRNodeBridge;             // populated by partitioner when linking diagrams
}

export interface IREdge {
  from: string; to: string;
  label?: string;                    // whitelist, ASCII, ≤30 chars
  kind?: 'causes'|'leads_to'|'computes'|'depends_on'|'configures'|'constrains'
       | 'reads_from'|'writes_to'|'validates'|'triggers'|'emits';
  evidence?: Evidence[];
}

export interface IRStyle {
  wrapLabelsAt?: number;
  nodeSpacing?: number;             // 50..120
  rankSpacing?: number;             // 50..120
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

export interface IRTitle {
  title: string;
  subtitle?: string;
}

export interface DiagramUnit {
  index: number;
  ir: IR;
  heading: IRTitle;
  summaryBullets: string[];
}

export interface IRPackMeta {
  k: number;
  method: 'none' | 'auto' | 'byK';
  budgets: { maxNodes: number; maxEdges: number; targetDensity?: number; maxBridges?: number };
  crossEdges: Array<{ from: string; to: string; fromDiagram: number; toDiagram: number }>;
}

export interface MultiDiagramPack {
  meta: IRPackMeta;
  diagrams: DiagramUnit[];
}
