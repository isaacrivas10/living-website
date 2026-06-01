from app.nodes import NODES, node_metas


def test_three_nodes_registered():
    assert set(NODES.keys()) == {"data-engineering", "ai-ml", "domo"}


def test_every_node_has_chips_and_instructions():
    for node in NODES.values():
        assert node.chips, f"{node.id} has no chips"
        assert node.instructions.strip(), f"{node.id} has no instructions"


def test_domo_is_hero_with_two_chips():
    assert len(NODES["domo"].chips) == 2


def test_node_metas_match_registry():
    metas = node_metas()
    assert len(metas) == 3
    assert {m.id for m in metas} == set(NODES.keys())
