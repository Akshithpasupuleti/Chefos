# Chefos Deployment Checklist

## Backend (`/backend`)

1. Set environment variables (copy from `.env.example`).
2. Required production values:
   - `DEBUG=False`
   - `DJANGO_SECRET_KEY=<strong-secret>`
   - `ALLOWED_HOSTS=<your-backend-domain>`
   - `CORS_ALLOWED_ORIGINS=<your-frontend-origin>`
   - `CSRF_TRUSTED_ORIGINS=<your-frontend-origin>`
   - MySQL vars: `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`
   - AI vars for menu generation:
     - `AI_PROVIDER=openai` (default flow: OpenAI then OpenRouter failover), or `deepseek`, or `openrouter`, or `gemini`
     - OpenAI: `OPENAI_API_KEY`, optional `OPENAI_MODEL`
     - DeepSeek direct: `DEEPSEEK_API_KEY`, optional `DEEPSEEK_MODEL`
     - OpenRouter: `OPENROUTER_API_KEY`, optional `OPENROUTER_MODEL` (example: `deepseek/deepseek-v3.2`)
     - Gemini: `GEMINI_API_KEY`, optional `GEMINI_MODEL`
3. Build/start:
   - Build: `./build.sh`
   - Start: `gunicorn config.wsgi:application`
4. Health endpoint:
   - `GET /api/health/`

## Frontend (`/frontend`)

1. Set `VITE_API_BASE_URL`:
   - Dev with proxy: `/api/`
   - Production: `https://<your-backend-domain>/api/`
2. Build:
   - `npm run build`
3. Deploy the generated `dist/` directory (or run via your host's static-site workflow).

## Local Integration

1. Backend: `source /home/chetan/chefos_env/bin/activate && python manage.py runserver`
2. Frontend: `npm run dev`
3. Login and signup use `/api/token/` and `/api/register/`
4. Chef assignment uses `/api/chefs/assign/`
