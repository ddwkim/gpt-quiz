import mermaid from 'mermaid';

export interface ExportRenderOptions {
  direction?: 'TB' | 'BT' | 'LR' | 'RL';
  renderer?: 'dagre' | 'elk';
  nodeSpacing?: number;
  rankSpacing?: number;
}

export async function renderForExport(mermaidSource: string, opt: ExportRenderOptions = {}): Promise<string> {
  const flowchart = {
    htmlLabels: false,
    defaultRenderer: opt.renderer ?? 'dagre',
    diagramPadding: 12,
    nodeSpacing: opt.nodeSpacing ?? 70,
    rankSpacing: opt.rankSpacing ?? 60,
    curve: 'basis'
  };

  const config = {
    startOnLoad: false,
    securityLevel: 'strict',
    flowchart
  } as any;

  mermaid.initialize(config);
  const { svg } = await mermaid.render('export-svg', mermaidSource);
  return svg;
}
