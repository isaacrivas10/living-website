from dataclasses import dataclass

from app.schemas import Chip, NodeId, NodeMeta


@dataclass(frozen=True)
class Node:
    id: NodeId
    title: str
    blurb: str
    chips: list[Chip]
    instructions: str


NODES: dict[NodeId, Node] = {
    "data-engineering": Node(
        id="data-engineering",
        title="Data Engineering",
        blurb="Pipelines, connectors, and transformation layers — designed and built.",
        chips=[
            Chip(label="API to BigQuery", prompt="Show a pipeline ingesting from a REST API into BigQuery with a dbt staging model."),
            Chip(label="Switch source to Kafka", prompt="Change the source connector from REST API to Kafka streaming and update the transformation code."),
            Chip(label="Add incremental loading", prompt="Add incremental loading and error handling to the pipeline and annotate the lineage."),
        ],
        instructions=(
            "Build an interactive data pipeline visualization for Argo Analytics. "
            "Use a two-column full-screen layout: left column (~55% width) shows a left-to-right lineage "
            "diagram with the stages Source, Staging, Intermediate, and BI, drawn as connected boxes using "
            "inline SVG or styled divs with connector lines; right column (~45% width) shows a code panel "
            "with a representative transformation snippet (a dbt model or Python connector) consistent with "
            "the request. Both columns should fill the full viewport height. "
            "Invent realistic but fictional table and column names. Hover tooltips on diagram nodes must use "
            "inline vanilla JavaScript."
        ),
    ),
    "ai-ml": Node(
        id="ai-ml",
        title="AI / ML",
        blurb="Models that turn data into prediction and insight.",
        chips=[
            Chip(label="Predict retail churn", prompt="Build a dashboard for a model that predicts customer churn for a retail business."),
            Chip(label="Forecast demand", prompt="Show a demand-forecasting model dashboard with accuracy metrics and a forecast chart."),
        ],
        instructions=(
            "Build an interactive mock machine-learning model dashboard for Argo Analytics. "
            "Use a full-screen grid layout: a top row of headline KPI tiles (AUC, precision, recall, F1 — "
            "fictional values), below that a two-column section where the left column holds the primary chart "
            "(ROC curve or feature-importance bar chart drawn with inline SVG) and the right column holds a "
            "plain-language model summary panel plus a secondary metric. "
            "All sections should fill the full viewport width; no narrow centered container. "
            "Fabricate all data."
        ),
    ),
    "domo": Node(
        id="domo",
        title="Domo",
        blurb="Natural language into a live BI dashboard.",
        chips=[
            Chip(label="Revenue by region", prompt="Show monthly revenue by region with anomaly detection highlighting unusual months."),
            Chip(label="Sales funnel KPIs", prompt="Build a sales funnel dashboard with conversion KPIs and a stage breakdown."),
        ],
        instructions=(
            "Build a BI-style dashboard in the spirit of a Domo view for Argo Analytics. "
            "Use a full-screen dashboard layout: a narrow header bar with the dashboard title, then a "
            "responsive CSS grid of cards that fills all remaining width and height. "
            "Include three to four cards — for example: a wide time-series line chart spanning the top row, "
            "a bar chart by category, and two KPI stat tiles — all drawn with inline SVG or canvas. "
            "Cards should use the glass panel style and stretch to fill their grid cell. "
            "If the request mentions anomalies or thresholds, highlight them visually. "
            "Fabricate all data. No centered narrow container."
        ),
    ),
}


def node_metas() -> list[NodeMeta]:
    return [
        NodeMeta(id=n.id, title=n.title, blurb=n.blurb, chips=n.chips)
        for n in NODES.values()
    ]
