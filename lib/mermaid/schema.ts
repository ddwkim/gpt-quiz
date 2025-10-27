export type Direction = 'TB' | 'BT' | 'LR' | 'RL';
export type DiagramKind = 'flowchart';

export type NodeIR = { id: string; label: string; note?: string; weight?: number; group?: string };
export type EdgeIR = { from: string; to: string; label?: string; weight?: number };

export type SubgraphIR = {
  id: string;
  title: string;
  nodes: string[];
};

export type FlowchartIR = {
  kind: 'flowchart';
  direction: Direction;
  nodes: NodeIR[];
  edges: EdgeIR[];
  subgraphs?: SubgraphIR[];
  style?: { wrapLabelsAt?: number };
};

export type DiagramIR = FlowchartIR; // extensible later

export const DiagramIRSchema = {
  name: 'diagram_ir',
  strict: true,
  schema: {
    type: 'object',
    required: ['kind', 'direction', 'nodes', 'edges', 'subgraphs', 'style'],
    additionalProperties: false,
    properties: {
      kind: { enum: ['flowchart'] },
      direction: { enum: ['TB', 'BT', 'LR', 'RL'] },
      nodes: {
        type: 'array',
        items: {
          type: 'object',
          required: ['id', 'label', 'note', 'weight', 'group'],
          additionalProperties: false,
          properties: {
            id: { type: 'string', pattern: '^[A-Za-z0-9_]+' },
            label: { type: 'string' },
            note: { type: 'string' },
            weight: { type: 'number' },
            group: { type: 'string' }
          }
        }
      },
      edges: {
        type: 'array',
        items: {
          type: 'object',
          required: ['from', 'to', 'label', 'weight'],
          additionalProperties: false,
          properties: {
            from: { type: 'string', pattern: '^[A-Za-z0-9_]+' },
            to: { type: 'string', pattern: '^[A-Za-z0-9_]+' },
            label: { type: 'string' },
            weight: { type: 'number' }
          }
        }
      },
      subgraphs: {
        type: 'array',
        items: {
          type: 'object',
          required: ['id', 'title', 'nodes'],
          additionalProperties: false,
          properties: {
            id: { type: 'string', pattern: '^[A-Za-z0-9_]+' },
            title: { type: 'string' },
            nodes: { type: 'array', items: { type: 'string', pattern: '^[A-Za-z0-9_]+' } }
          }
        }
      },
      style: {
        type: 'object',
        additionalProperties: false,
        properties: { wrapLabelsAt: { type: 'integer', minimum: 10, maximum: 80 } },
        required: ['wrapLabelsAt']
      }
    }
  }
} as const;
