from typing import Literal

from pydantic import BaseModel

NodeId = Literal["data-engineering", "ai-ml", "domo"]


class Chip(BaseModel):
    label: str
    prompt: str


class NodeMeta(BaseModel):
    id: NodeId
    title: str
    blurb: str
    chips: list[Chip]


class GenerateRequest(BaseModel):
    node: NodeId
    prompt: str


class RepairRequest(BaseModel):
    node: NodeId
    prompt: str
    previous_html: str
    error: str
