import type { QualityParameters } from '@/lib/agents/quality';
import { defaultModel } from '@/lib/openai-client';

const hqModel = process.env.OPENAI_QUALITY_MODEL || defaultModel;

export const QUALITY_DEFAULTS: QualityParameters = {
  candidateMultiplier: 3,
  scSamples: 3,
  redteamRounds: 1,
  agreementThreshold: 0.67,
  temps: {
    topic: 0.3,
    writer: 0.5,
    distractor: 0.4,
    reviewer: 0.3,
    ranker: 0.2,
    calibrator: 0.2,
    polisher: 0.2,
    validator: 0.1
  },
  models: {
    topic: hqModel,
    writer: hqModel,
    distractor: hqModel,
    reviewer: hqModel,
    ranker: hqModel,
    calibrator: hqModel,
    polisher: hqModel,
    validator: hqModel
  }
};
