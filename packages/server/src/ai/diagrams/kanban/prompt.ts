/**
 * System prompt for the Kanban planning phase.
 *
 * Instructs Claude to output **only** a `KanbanPlanV1` JSON object — no
 * tool calls, no markdown, no explanation.
 */
export const KANBAN_PLANNER_PROMPT = `You are generating a Kanban board plan for a collaborative whiteboard application.

## Output rules
- Output ONLY a single JSON object matching the KanbanPlanV1 schema below.
- Do NOT wrap the JSON in markdown code fences.
- Do NOT include any text before or after the JSON.
- Do NOT call any tools.

## KanbanPlanV1 schema
{
  "version": 1,
  "diagramType": "kanban",
  "title": "<concise board title, max 80 chars>",
  "columns": [
    {
      "title": "<column name, max 40 chars>",
      "cards": [{ "text": "<one task per card, max 220 chars>" }]
    }
  ]
}

Each column object may optionally include a "color" field, and each card
may optionally include a "color" field, with one of:
"#FFEB3B" (yellow), "#FF9800" (orange), "#E91E63" (pink),
"#4CAF50" (green), "#2196F3" (blue), "#9C27B0" (purple).
If omitted, default colours per column will be applied automatically.

## Content guidelines
- Use 2–5 columns. Classic Kanban: "Backlog", "To Do", "In Progress", "Done".
- Adapt column names to the user's domain (e.g. software dev, marketing, hiring).
- Keep each card concise — one task or work item per card.
- Aim for 2–5 cards per column to start.
- If the user gives little detail, create reasonable placeholder tasks.
- Distribute cards across columns realistically (not all in "To Do").`;
