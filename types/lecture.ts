export type KnowledgeBlock = {
  id: string;
  title: string;
  text: string;
  source: {
    url: string;
    anchor?: string;
  };
  code?: { lang?: string; content: string }[];
};

export type LectureOutlineSection = {
  id: string;
  title: string;
  goal: string;
  targetDurationSec: number;
};

export type LectureOutline = {
  id: string;
  title: string;
  prerequisites: string[];
  learningObjectives: string[];
  sections: LectureOutlineSection[];
  totalTargetSec: number;
  sourceUrl: string;
  language?: string;
  audienceLevel?: string;
};

export type SectionScript = {
  sectionId: string;
  paragraphs: string[];
  quizlets?: { question: string; answer: string }[];
  recap?: string[];
};

export type TTSSegment = {
  sectionId: string;
  ordinal: number;
  text: string;
  estDurationSec: number;
  fileName: string;
};

export type LectureManifest = {
  id: string;
  sourceUrl: string;
  lang: string;
  outline: LectureOutline;
  scripts: Record<string, SectionScript>;
  segments: TTSSegment[];
  audio: {
    segmentsDir: string;
    full?: string;
    format: 'mp3' | 'wav' | 'ogg';
    voice: string;
    model: string;
  };
  captions?: { srt?: string; vtt?: string };
  createdAt: string;
  version: number;
};
