from app import cache


def test_save_and_load_round_trip(monkeypatch, tmp_path):
    monkeypatch.setattr(cache, "CACHE_DIR", tmp_path)
    cache.save("domo", "Revenue  by Region", "<html>a</html>", ms=10)
    entry = cache.load("domo", "revenue by region")  # normalized match
    assert entry is not None
    assert entry["html"] == "<html>a</html>"


def test_pin_is_preserved_on_resave(monkeypatch, tmp_path):
    monkeypatch.setattr(cache, "CACHE_DIR", tmp_path)
    cache.save("domo", "p", "<html>1</html>", ms=1, pinned=True)
    cache.save("domo", "p", "<html>2</html>", ms=2)  # no pinned flag
    entry = cache.load("domo", "p")
    assert entry["pinned"] is True
    assert entry["html"] == "<html>2</html>"


def test_get_seed_returns_pinned_html(monkeypatch, tmp_path):
    monkeypatch.setattr(cache, "CACHE_DIR", tmp_path)
    cache.save("ai-ml", "unpinned", "<html>no</html>", ms=1)
    cache.save("ai-ml", "pinned", "<html>yes</html>", ms=1, pinned=True)
    assert cache.get_seed("ai-ml") == "<html>yes</html>"


def test_get_seed_none_when_empty(monkeypatch, tmp_path):
    monkeypatch.setattr(cache, "CACHE_DIR", tmp_path)
    assert cache.get_seed("domo") is None


def test_get_seeds_returns_all_pinned(monkeypatch, tmp_path):
    monkeypatch.setattr(cache, "CACHE_DIR", tmp_path)
    cache.save("domo", "p1", "<html>first</html>", ms=100, pinned=True)
    cache.save("domo", "p2", "<html>second</html>", ms=200, pinned=True)
    cache.save("domo", "p3", "<html>unpinned</html>", ms=150)
    seeds = cache.get_seeds("domo")
    assert len(seeds) == 2
    assert all("<html>" in s for s in seeds)


def test_get_seeds_empty_when_none_pinned(monkeypatch, tmp_path):
    monkeypatch.setattr(cache, "CACHE_DIR", tmp_path)
    cache.save("domo", "p", "<html>x</html>", ms=1)
    assert cache.get_seeds("domo") == []


def test_unpin_clears_pinned_flag(monkeypatch, tmp_path):
    monkeypatch.setattr(cache, "CACHE_DIR", tmp_path)
    cache.save("domo", "p", "<html>x</html>", ms=1, pinned=True)
    assert cache.load("domo", "p")["pinned"] is True
    result = cache.unpin("domo", "p")
    assert result is True
    assert cache.load("domo", "p")["pinned"] is False


def test_unpin_returns_false_when_entry_missing(monkeypatch, tmp_path):
    monkeypatch.setattr(cache, "CACHE_DIR", tmp_path)
    assert cache.unpin("domo", "does-not-exist") is False
