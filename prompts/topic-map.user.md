Config: n={{n}}, difficulty={{difficulty}}, mix={{mix}}

TASK
Create a topic map (`topics`) that covers the transcript. Each topic must include:
- `id` (slug),
- `title` (≤ 8 words),
- `summary` (≤ 280 chars),
- `importance` 1..5,
- `span` [startMsgIdx, endMsgIdx],
- `facts` (distinct atomic claims that can support assessment items).

TRANSCRIPT
{{transcript}}
