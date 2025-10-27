Type: {{type}}
Focus: {{focus}}
Language: {{lang}}

TRANSCRIPT
{{transcript}}

Return a JSON object with the following fields only:
{
  "title": string,
  "description": string,
  "mermaid": string,
  "source_spans": [[number, number], ...],
  "metadata": { "model": string }
}
