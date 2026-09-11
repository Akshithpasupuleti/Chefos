# Chefos

Chefos is a full-stack platform that connects customers with chefs for recurring meal subscriptions and on-demand cooking services. Customers can discover chefs, configure meal preferences, generate weekly menus, schedule meals, pay for subscriptions, and follow service progress.

Chef partners use a dedicated workflow to manage availability, location, assignments, and the complete service journey.

The project includes a **Django REST API**, a **React web application**, and an **Expo React Native application** with customer and chef-partner modes.

## Features

### Customer Experience

- Create an account and sign in with JWT authentication.
- Browse chef profiles and find nearby chefs.
- Request a chef immediately or assign one to a subscription.
- Set cuisine, dietary, meal, and menu preferences.
- Generate AI-assisted weekly menus.
- View weekly menus and daily meal schedules.
- Preview subscription pricing and create payment orders.
- Track active subscriptions and service status.
- View instant-chef order history and submit feedback.

### Chef-Partner Experience

- Register and sign in through a dedicated chef workflow.
- Manage availability and working slots.
- Update current location.
- View assigned and nearby instant-service requests.
- Accept or reject instant chef requests.
- Handle service-start verification, journey updates, and completion.
- Review service history from the chef dashboard.

### Operations and Integrations

- Django Admin for internal data management.
- AI menu generation through OpenRouter, OpenAI, DeepSeek, or Gemini.
- Cuisine search through SerpAPI when configured.
- Payment order creation and verification through Razorpay.
- WhiteNoise static-file serving in production.
- SQLite for local development and optional MySQL for production.

## Technology Stack

| Area | Technology |
| --- | --- |
| Backend | Python, Django, Django REST Framework |
| Authentication | Simple JWT access and refresh tokens |
| Web | React 19, Vite, React Router, Axios |
| Maps | Leaflet and React Leaflet |
| Mobile | Expo 53, React Native, React Navigation |
| Database | SQLite locally; MySQL when configured |
| Production server | Gunicorn and WhiteNoise |
| External services | AI providers, SerpAPI, Razorpay |

## Repository Structure

```text
Chefos/
├── backend/                  # Django project and REST API
│   ├── chef/                 # Chef discovery, assignment, and partner workflows
│   ├── config/               # Settings, URLs, WSGI, and ASGI
│   ├── core/                 # Subscriptions, menus, scheduling, payments, and AI
│   ├── menu/                 # Menu domain app
│   ├── users/                # Custom user model and user logic
│   ├── manage.py
│   └── requirements.txt
├── frontend/                 # React and Vite web application
│   └── src/
│       ├── components/       # Shared UI and authentication components
│       ├── pages/            # Customer and chef-partner pages
│       ├── routes/           # Protected route handling
│       └── services/         # API client and authentication sessions
├── mobile/                   # Expo React Native application
│   └── src/                  # Screens, navigation, API client, and app logic
├── .gitignore
└── README.md
```

## Prerequisites

- Python 3.10 or newer.
- Node.js and npm compatible with the project's Vite and Expo versions.
- Git.
- Expo Go, an Android emulator, or an iOS simulator for mobile development.

Optional requirements include MySQL, an AI provider API key, a SerpAPI key, Razorpay credentials, and an Expo/EAS account for native builds.

## Quick Start

Run the backend, frontend, and mobile application in separate terminals. Unless otherwise stated, start each setup section from the repository root.

### 1. Clone the Repository

```bash
git clone https://github.com/Akshithpasupuleti/Chefos.git
cd Chefos
```

If the project is already on your computer, open a terminal in its root directory.

### 2. Configure and Run the Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python manage.py migrate
python manage.py runserver
```

On Windows PowerShell, use this activation command instead:

```powershell
.venv\Scripts\Activate.ps1
```

Local URLs:

- API: http://127.0.0.1:8000/api/
- Django Admin: http://127.0.0.1:8000/admin/

To create an administrator account:

```bash
python manage.py createsuperuser
```

### 3. Configure and Run the Web Application

Open another terminal at the repository root:

```bash
cd frontend
npm install
```

Create `frontend/.env` with:

```dotenv
VITE_API_BASE_URL=http://127.0.0.1:8000/api/
```

Start the development server:

```bash
npm run dev
```

Open the URL shown by Vite, normally http://localhost:5173.

To make the web application available to devices on the same local network:

```bash
npm run dev:lan
```

### 4. Configure and Run the Mobile Application

The Django server and phone must be on the same network.

Find your computer's LAN IP address, such as `192.168.1.10`. Stop the existing Django development server and restart it on all interfaces:

```bash
cd backend
source .venv/bin/activate
python manage.py runserver 0.0.0.0:8000
```

Open another terminal at the repository root:

```bash
cd mobile
npm install
```

Create `mobile/.env` using your computer's actual LAN IP address:

```dotenv
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.10:8000/api/
```

Do not use `localhost` or `127.0.0.1` when testing on a physical phone.

Start the customer application:

```bash
npm run start:user
```

Or start the chef-partner application:

```bash
npm run start:chef
```

Scan the QR code with a compatible Expo Go version or choose an installed emulator from the Expo terminal.

## Backend Configuration

Copy `backend/.env.example` to `backend/.env`.

Local development uses SQLite by default. External integrations require their respective credentials.

### Core Settings

| Variable | Purpose | Local example |
| --- | --- | --- |
| `DJANGO_SECRET_KEY` | Django signing secret | A long random string |
| `DEBUG` | Development behavior | `True` |
| `ALLOWED_HOSTS` | Comma-separated backend hosts | `*` for local development only |
| `CORS_ALLOWED_ORIGINS` | Origins allowed to call the API | `http://localhost:5173` |
| `CSRF_TRUSTED_ORIGINS` | Trusted browser origins | `http://localhost:5173` |
| `API_CACHE_TTL_SHORT` | Short cache lifetime in seconds | `60` |
| `API_CACHE_TTL_MEDIUM` | Medium cache lifetime in seconds | `300` |

Configure exact hosts and origins before deploying.

### Database

Leave the database variables empty to use `backend/db.sqlite3`.

To configure MySQL:

```dotenv
DB_NAME=chefos
DB_USER=chefos_user
DB_PASSWORD=your-database-password
DB_HOST=127.0.0.1
DB_PORT=3306
```

Run migrations after changing databases or pulling new migrations:

```bash
python manage.py migrate
```

### AI Menu Generation

Choose a provider and configure its API key and an available model supported by that provider.

OpenRouter configuration:

```dotenv
AI_PROVIDER=openrouter
AI_STRICT_MODE=False
OPENROUTER_API_KEY=your-key
OPENROUTER_MODEL=your-supported-model-id
```

Other provider configuration variables:

```dotenv
OPENAI_API_KEY=
OPENAI_MODEL=
DEEPSEEK_API_KEY=
DEEPSEEK_MODEL=
GEMINI_API_KEY=
GEMINI_MODEL=
```

Set `AI_PROVIDER` to the provider you intend to use. Model availability depends on the provider and your account.

### Search and Payments

```dotenv
SERPAPI_API_KEY=
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
```

Without Razorpay credentials, the complete production payment flow is unavailable.

**Mobile payment limitation:** Native Razorpay checkout still needs to be integrated into the mobile client. The current mobile subscription flow creates the backend payment order.

Never commit real API keys or local `.env` files.

## Authentication

Chefos uses JWT bearer authentication.

- Login returns access and refresh tokens.
- Authenticated requests include `Authorization: Bearer <token>`.
- Access tokens last one day and refresh tokens last seven days by default.
- The web client attempts to refresh expired access tokens automatically.
- Customer and chef sessions are stored separately.
- Protected routes verify the active role.

### Main Authentication Endpoints

```text
POST /api/register/
POST /api/token/
POST /api/token/refresh/
POST /api/chefs/partner/register/
GET  /api/chefs/partner/me/
```

## Main API Areas

| Area | Example endpoints |
| --- | --- |
| Health | `GET /api/health/` |
| Chefs | `GET /api/chefs/`, `POST /api/chefs/assign/` |
| Instant service | `/api/chefs/instant/request/` |
| Chef partner | `/api/chefs/partner/availability/`, `/api/chefs/partner/location/` |
| Menus | `/api/menu/weekly/`, `/api/menu/today/`, `/api/menu/generate/` |
| Preferences | `/api/menu/preference/`, `/api/cuisines/search/` |
| Subscriptions | `/api/subscriptions/create/`, `/api/subscription/active/` |
| Scheduling | `/api/scheduling/capacity-check/` |
| Payments | `/api/payments/create-order/`, `/api/payments/verify/` |
| Feedback and history | `/api/feedback/`, `/api/chefs/history/instant/` |

Protected endpoints require a valid JWT access token.

See `backend/core/urls.py` and `backend/chef/urls.py` for the complete route list.

## Typical User Flow

1. A customer creates an account and signs in.
2. The customer selects meal and cuisine preferences.
3. Chefos generates or displays a weekly menu.
4. The customer checks scheduling capacity and chooses a subscription.
5. The backend previews the price and creates a payment order.
6. A chef is assigned, or the customer creates an instant chef request.
7. The chef accepts the work, verifies service start, and updates journey status.
8. The service is completed, and the customer can submit feedback.

## Development Commands

Run each group from its respective directory.

### Backend

```bash
cd backend
source .venv/bin/activate

python manage.py runserver       # Start the API
python manage.py makemigrations  # Create model migrations
python manage.py migrate         # Apply migrations
python manage.py test            # Run backend tests
```

### Web

```bash
cd frontend

npm run dev       # Start the development server
npm run dev:lan   # Make the server available on the LAN
npm run lint      # Run ESLint checks
npm run build     # Create a production bundle
npm run preview   # Preview the production bundle
```

### Mobile

```bash
cd mobile

npm run start:user       # Start the customer Expo app
npm run start:chef       # Start the chef-partner Expo app
npm run android:user     # Run the customer Android app
npm run android:chef     # Run the chef Android app
npm run ios:user         # Run the customer iOS app
npm run ios:chef         # Run the chef iOS app
npm run build:apk        # Build the customer Android preview APK
npm run build:apk:chef   # Build the chef Android preview APK
npm run build:aab        # Build the customer production Android bundle
```

Native commands require the matching Android or iOS toolchain. EAS builds require Expo authentication and valid EAS configuration.

## Production Deployment

### Backend

The included build script installs dependencies, collects static files, and runs migrations:

```bash
cd backend
./build.sh
```

Start the production server:

```bash
gunicorn config.wsgi:application
```

Before deploying:

- Set `DEBUG=False`.
- Use a strong Django secret key.
- Configure exact allowed hosts, CORS origins, and CSRF origins.
- Provide a persistent database.
- Configure external service credentials.
- Keep HTTPS security settings enabled.

Health endpoint:

```text
GET /api/health/
```

See `backend/DEPLOYMENT.md` and `backend/render.yaml` for the existing deployment configuration.

### Web

Set the deployed API URL in the build environment:

```dotenv
VITE_API_BASE_URL=https://your-api-domain.example/api/
```

Build the application:

```bash
cd frontend
npm install
npm run build
```

Deploy `frontend/dist/` to a static host.

Configure unknown browser paths to serve `index.html`, because the application uses client-side routing.

## Troubleshooting

### The Web Application Cannot Reach the API

- Confirm Django is running on port `8000`.
- Confirm `VITE_API_BASE_URL` ends with `/api/`.
- Restart Vite after changing `frontend/.env`.
- Add the web application's exact origin to production CORS and CSRF settings.

### A Phone Cannot Reach Django

- Use the computer's LAN IP instead of `localhost` or `127.0.0.1`.
- Run Django with `python manage.py runserver 0.0.0.0:8000`.
- Keep the phone and computer on the same network.
- Allow port `8000` through the firewall if required.
- Restart Expo after changing `mobile/.env`.

### Database Errors After Pulling Changes

Activate the backend virtual environment and run:

```bash
python manage.py migrate
```

### AI Menu Generation Does Not Work

- Verify that `AI_PROVIDER` names a supported provider.
- Verify the API key and configured model.
- Check the Django terminal for the provider error.
- Keep `AI_STRICT_MODE=False` to permit configured fallback behavior.

### Authentication Returns `401 Unauthorized`

- Sign in again if both tokens have expired.
- Confirm the request includes a bearer access token.
- Confirm the account role matches the protected customer or chef route.

## Git and Security Notes

- Do not commit `.env` files, API keys, database passwords, or payment secrets.
- Do not commit `node_modules`, virtual environments, generated build output, caches, or the local SQLite database.
- Keep source assets tracked; exclude generated static-file output.
- Run backend tests and frontend lint/build checks before pushing significant changes.
- Commit migrations whenever Django models change.

## Current Scope

Chefos provides application and API flows for customer subscriptions, chef-partner operations, menu planning, scheduling, and payment order handling.

A production deployment still requires real service credentials, strict host and origin configuration, a persistent database, and platform-specific payment checkout where applicable.
