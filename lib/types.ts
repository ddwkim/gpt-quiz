export type Msg = { role: 'user' | 'assistant'; content: string; ts?: number };
export type Conversation = { title?: string; messages: Msg[] };

export type Difficulty = 'easy' | 'medium' | 'hard' | 'mixed';
export type ItemType = 'mcq' | 'true_false' | 'short_answer';

export type QuizConfig = {
  n_questions: number;
  difficulty: Difficulty;
  mix: ItemType[];
  lang: 'en' | 'ko';
  seed?: number;
};

export type QuizItem = {
  id: string;
  type: ItemType;
  prompt: string;
  choices?: string[];
  answer: number | boolean | string;
  rationale?: string;
  difficulty: Exclude<Difficulty, 'mixed'>;
  tags?: string[];
  source_spans?: [number, number][];
};

export type IssueKind = 'ambiguity' | 'leakage' | 'style' | 'coverage' | 'difficulty' | 'other';

export type QualityIssue = {
  kind: IssueKind;
  explanation: string;
  fix?: string;
  severity?: 'low' | 'medium' | 'high';
  blocking?: boolean;
};

export type ItemQuality = {
  item_id: string;
  agreement?: number;
  issues?: QualityIssue[];
  notes?: string[];
};

export type QualityReport = {
  summary?: {
    coverage?: number;
    difficulty_balance?: 'pass' | 'warn' | 'fail';
    rubric_scores?: Record<string, number>;
    notes?: string[];
    dropped_item_count?: number;
  };
  items?: ItemQuality[];
  dropped_items?: { id: string; reason: string }[];
};

export type Quiz = {
  title?: string;
  description?: string;
  items: QuizItem[];
  metadata?: {
    source_url?: string;
    model?: string;
    generated_at?: string;
    high_quality?: boolean;
    cost_usd?: number;
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
  quality_report?: QualityReport;
};

export type Topic = {
  id: string;
  title: string;
  summary: string;
  importance: number;
  span: [number, number];
  facts: string[];
};

export type TopicMap = {
  topics: Topic[];
};

export type ItemDraft = {
  id: string;
  topic_id: string;
  type: ItemType;
  prompt: string;
  choices?: string[];
  answer: number | boolean | string;
  rationale?: string;
  difficulty: 'easy' | 'medium' | 'hard';
  tags?: string[];
  distractor_tags?: string[];
  source_spans: [number, number][];
  notes?: string[];
};

export type SelfConsistencySample = {
  answer: number | boolean | string;
  reasoning?: string;
};

export type SelfConsistencyReport = {
  item_id: string;
  agreement: number;
  verdict: 'keep' | 'drop' | 'revise';
  alt_answers?: { answer: number | boolean | string; frequency: number }[];
  notes?: string[];
};

export type RedteamIssue = {
  item_id: string;
  kind: IssueKind;
  explanation: string;
  fix?: string;
  blocking: boolean;
};

export type RankingDecision = {
  selected: string[];
  dropped: { id: string; reason: string }[];
  rubric_scores?: Record<string, number>;
};

export type QualityModeOptions = {
  enabled: boolean;
  candidateMultiplier?: number;
  selfConsistencySamples?: number;
};

// Focused diagram generation profile (public API & UI)
export type FocusProfile = {
  topic: string;
  mustInclude?: string[];
  exclude?: string[];
  maxNodes?: number;
  maxEdges?: number;
  subgraphTitle?: string;
  direction?: 'TB' | 'BT' | 'LR' | 'RL';
};
