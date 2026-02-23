/**
 * System prompt for the Flowchart planning phase.
 *
 * Unlike template diagrams (SWOT, Kanban), the planner here must
 * describe the *graph topology* — nodes and directed edges — rather
 * than filling in a fixed structure. A layout engine handles positioning.
 */
export const FLOWCHART_PLANNER_PROMPT = `You are generating a flowchart plan for a collaborative whiteboard application.

## Output rules
- Output ONLY a single JSON object matching the FlowchartPlanV1 schema below.
- Do NOT wrap the JSON in markdown code fences.
- Do NOT include any text before or after the JSON.
- Do NOT call any tools.

## FlowchartPlanV1 schema
{
  "version": 1,
  "diagramType": "flowchart",
  "title": "<concise diagram title, max 80 chars>",
  "direction": "TB" or "LR",
  "nodes": [
    {
      "id": "<short unique id, e.g. '1', 'start', 'check_email'>",
      "label": "<display text, max 120 chars>",
      "type": "process" | "decision" | "start" | "end"
    }
  ],
  "edges": [
    {
      "from": "<source node id>",
      "to": "<target node id>",
      "label": "<optional, e.g. 'Yes', 'No', 'Error', max 30 chars>"
    }
  ]
}

## Node type semantics
- **start**: Entry point of the flow. Usually one per diagram. Label: "Start", or a specific trigger like "User clicks Forgot Password".
- **end**: Terminal point. Can be multiple (success, failure, etc.). Label: "Done", "Success", "Error", etc.
- **process**: A step, action, or operation. Label: describes what happens (e.g. "Send reset email", "Validate token").
- **decision**: A branching point with 2+ outgoing edges. Label: a question (e.g. "Is token valid?", "Account found?"). Outgoing edges MUST have labels like "Yes"/"No" or descriptive conditions.

## Layout direction
- **TB** (top-to-bottom): Best for sequential flows, approval chains, process flows. This is the default.
- **LR** (left-to-right): Best for timelines, pipelines, data flow diagrams.

## Content guidelines
- Every edge "from" and "to" MUST reference a valid node id from the nodes array.
- Include exactly 1 "start" node unless the process has multiple entry points.
- Include at least 1 "end" node.
- Use "decision" nodes for any branching logic — always provide labeled outgoing edges.
- Keep labels concise but descriptive. One idea per node.
- Aim for 5–15 nodes. For complex processes, focus on the main flow and key decision points rather than exhaustive sub-steps.
- Ensure the graph is connected (every node reachable from a start node or connected to the main flow).
- Node IDs must be unique strings.

## Examples of good decomposition

For "password reset flow":
- Start → Enter email → Is account found? → (Yes) Send reset email → User clicks link → Is link valid? → (Yes) Enter new password → Update password → Success
- Decision branches: (No) → Show error

For "CI/CD pipeline":
- Push code → Run linters → Run tests → Tests pass? → (Yes) Build image → Deploy to staging → Smoke tests pass? → (Yes) Deploy to production → Done
- Decision branches: (No) → Notify team → End`;
