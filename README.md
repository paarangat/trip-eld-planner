# Trip Planner & ELD Log Generator

Full-stack app that turns four trip inputs (current location, pickup, drop-off,
current cycle hours) into a routed map plus FMCSA daily log sheets, compliant
with U.S. Federal Hours-of-Service rules for a property-carrying 70/8 driver.

See `ARCHITECTURE.md` for system design and `CLAUDE.md` for engineering rules.

## Stack

- **Backend:** Python 3.11+, Django 5.x, Django REST Framework, OpenRouteService.
- **Frontend:** React 18+, Vite, `react-leaflet` + Leaflet.

## Local setup

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in DJANGO_SECRET_KEY, ORS_API_KEY
python manage.py migrate
python manage.py runserver
```

The API listens on `http://localhost:8000`. Health check: `GET /api/health/`.

### Frontend

```bash
cd frontend
npm install
cp .env.example .env.local   # set VITE_API_BASE_URL=http://localhost:8000
npm run dev
```

The dev server listens on `http://localhost:5173`.

## Environment variables

| Var | Used by | Notes |
|---|---|---|
| `DJANGO_SECRET_KEY` | backend | Required in production. |
| `DJANGO_SETTINGS_MODULE` | backend | `config.settings.dev` or `config.settings.prod`. |
| `ALLOWED_HOSTS` | backend | Comma-separated; production only. |
| `CORS_ALLOWED_ORIGINS` | backend | Comma-separated frontend origins. |
| `ORS_API_KEY` | backend | OpenRouteService key. **Server-side only.** |
| `DATABASE_URL` | backend | Postgres URL; production only. |
| `VITE_API_BASE_URL` | frontend | Backend origin. |

## Tests

```bash
# Backend
cd backend && python manage.py test

# Frontend
cd frontend && npm run build
```
