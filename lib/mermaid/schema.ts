import type { IR, IRNode, IREdge, IRStyle } from '@/lib/ir/schema';

export type Direction = IR['direction'];
export type DiagramKind = IR['kind'];

export type DiagramIR = IR;
export type FlowchartIR = IR;
export type NodeIR = IRNode;
export type EdgeIR = IREdge;
export type DiagramIRStyle = IRStyle;

export const EDGE_LABEL_WHITELIST = [
  'causes',
  'leads_to',
  'computes',
  'depends_on',
  'configures',
  'constrains',
  'reads_from',
  'writes_to',
  'validates',
  'triggers',
  'emits'
] as const;

export const DiagramIRSchema = {
  name: 'diagram_ir',
  strict: false,
  schema: {
    type: 'object',
    required: ['kind', 'direction', 'nodes', 'edges'],
    additionalProperties: false,
    properties: {
      kind: { enum: ['flowchart'] },
      direction: { enum: ['TB', 'BT', 'LR', 'RL'] },
      nodes: {
        type: 'array',
        items: {
          type: 'object',
          required: ['id'],
          additionalProperties: false,
          properties: {
            id: { type: 'string', pattern: '^[A-Za-z_][A-Za-z0-9_]*$' },
            label: { type: 'string', maxLength: 80 },
            labelLines: {
              type: 'array',
              items: { type: 'string', maxLength: 60 },
              minItems: 1,
              maxItems: 6
            },
            shape: { enum: ['rect', 'decision', 'terminator'] },
            weight: { type: 'number' },
            group: { type: 'string', maxLength: 60 },
            bridge: {
              type: 'object',
              required: ['toDiagram', 'targetLabel'],
              additionalProperties: false,
              properties: {
                toDiagram: { type: 'integer', minimum: 0 },
                targetLabel: { type: 'string', maxLength: 80 }
              }
            },
            evidence: {
              type: 'array',
              items: {
                type: 'object',
                required: ['role', 'turn', 'start', 'end'],
                additionalProperties: false,
                properties: {
                  role: { enum: ['user', 'assistant'] },
                  turn: { type: 'integer', minimum: 0 },
                  start: { type: 'integer', minimum: 0 },
                  end: { type: 'integer', minimum: 0 }
                }
              }
            }
          }
        }
      },
      edges: {
        type: 'array',
        items: {
          type: 'object',
          required: ['from', 'to'],
          additionalProperties: false,
          properties: {
            from: { type: 'string', pattern: '^[A-Za-z_][A-Za-z0-9_]*$' },
            to: { type: 'string', pattern: '^[A-Za-z_][A-Za-z0-9_]*$' },
            label: { type: 'string', maxLength: 40 },
            kind: { enum: EDGE_LABEL_WHITELIST },
            evidence: {
              type: 'array',
              items: {
                type: 'object',
                required: ['role', 'turn', 'start', 'end'],
                additionalProperties: false,
                properties: {
                  role: { enum: ['user', 'assistant'] },
                  turn: { type: 'integer', minimum: 0 },
                  start: { type: 'integer', minimum: 0 },
                  end: { type: 'integer', minimum: 0 }
                }
              }
            }
          }
        }
      },
      subgraphs: {
        type: 'array',
        items: {
          type: 'object',
          required: ['title', 'nodeIds'],
          additionalProperties: false,
          properties: {
            title: { type: 'string', maxLength: 80 },
            nodeIds: { type: 'array', items: { type: 'string', pattern: '^[A-Za-z_][A-Za-z0-9_]*$' }, minItems: 1 }
          }
        }
      },
      style: {
        type: 'object',
        additionalProperties: false,
        properties: {
          wrapLabelsAt: { type: 'integer', minimum: 12, maximum: 60 },
          nodeSpacing: { type: 'integer', minimum: 50, maximum: 120 },
          rankSpacing: { type: 'integer', minimum: 50, maximum: 120 },
          renderer: { enum: ['dagre', 'elk'] }
        }
      }
    }
  }
} as const;
