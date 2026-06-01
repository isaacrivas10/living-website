.PHONY: backend frontend test check-model

backend:
	cd backend && .venv/bin/uvicorn app.main:app --reload --port 8000

frontend:
	cd frontend && npm run dev

test:
	cd backend && .venv/bin/pytest -v

check-model:
	cd backend && .venv/bin/python scripts/check_model.py
