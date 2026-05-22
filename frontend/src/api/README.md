# Frontend API Contracts

`openapi.json` is generated from the FastAPI app with:

```bash
cd backend
python scripts/export_openapi.py
```

Downstream frontend agents should consume this contract instead of inventing
endpoint shapes by hand.
