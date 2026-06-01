from openai.types.chat.chat_completion_message_param import ChatCompletionMessageParam

from app.nodes import NODES
from app.schemas import NodeId

DESIGN_TOKENS = """\
- Background: deep charcoal #0b0f14. Always set `html, body { background: #0b0f14; margin: 0; padding: 0; }`.
  Never use transparent backgrounds — the artifact must have its own dark fill.
- Page padding: 20px. Card inner padding: 16px.
- Glass card: background rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
  border-radius: 10px; box-shadow: 0 4px 24px rgba(0,0,0,0.4).
- Primary accent (positive data, key lines, highlights): green #2fbf71.
- Secondary highlight (anomalies, warnings, emphasis): yellow #f2c94c.
- Tertiary accent (secondary data series): teal #21a8a0.
- Text: #e6edf3 primary, #9ba7b4 muted/labels. Never go below 11px for labels.
- SVG charts: grid lines stroke rgba(255,255,255,0.06) stroke-width 0.5;
  axis lines rgba(255,255,255,0.15); data area filled with semi-transparent gradient
  (e.g. rgba(47,191,113,0.15) → transparent for green series).
- Typography: system-ui, -apple-system, sans-serif. Shapes: border-radius 8-10px.
- Numbers: comma-separate thousands (1,234); % suffix for ratios; $ prefix for currency.
- Mood: technical, premium, dark, spacious — accent colors used purposefully, not decoratively."""

SYSTEM_RULES = """\
You generate a single, self-contained HTML document for an interactive capability showcase.

Hard rules:
1. Output ONLY the HTML document. No markdown, no code fences, no commentary before or after.
2. Everything is inline: CSS in a <style> tag in <head>; JavaScript in a <script> tag just
   before </body>.
3. No external requests of any kind: no CDN links, no imports, no network fonts, no fetch.
   Renders in a sandboxed iframe with no network access.
4. Fabricate all data inline. No real datasets, APIs, or credentials.
5. Match the visual aesthetic in DESIGN TOKENS below.
6. Produce valid HTML — balanced tags, no syntax errors.
7. Full-screen canvas: the iframe fills the browser window. Use flex/grid layouts that stretch
   to fill all available width and height. No fixed pixel widths, no narrow max-width
   containers, no centered card layouts. It should feel like a real full-screen dashboard.
8. SVG for all charts and data visualizations — no <canvas>. Draw axes, grid lines, tick
   labels, and data shapes directly in SVG. Use viewBox and preserveAspectRatio="none" so
   charts fill their containers.
9. JavaScript safety: wrap all DOM queries in DOMContentLoaded; use const/let, never var;
   no document.write, no eval; bind events with addEventListener, not inline attributes.
10. Data density: 6–12 data points per chart. More creates illegible labels and visual noise."""


def _system_content(node: NodeId) -> str:
    n = NODES[node]
    return (
        f"{SYSTEM_RULES}\n\n"
        f"DESIGN TOKENS:\n{DESIGN_TOKENS}\n\n"
        f"NODE FOCUS:\n{n.instructions}"
    )


def build_generate_messages(node: NodeId, user_prompt: str) -> list[ChatCompletionMessageParam]:
    return [
        {"role": "system", "content": _system_content(node)},
        {"role": "user", "content": user_prompt},
    ]


def build_repair_messages(
    node: NodeId, user_prompt: str, previous_html: str, error: str
) -> list[ChatCompletionMessageParam]:
    repair = (
        "Your previous attempt for this request failed to render in the browser.\n\n"
        f"Original request: {user_prompt}\n\n"
        f"Render error:\n{error}\n\n"
        f"Previous HTML:\n{previous_html}\n\n"
        "Return a corrected single self-contained HTML document that fixes the error. "
        "Output only the HTML, with no explanation and no code fences."
    )
    return [
        {"role": "system", "content": _system_content(node)},
        {"role": "user", "content": repair},
    ]
