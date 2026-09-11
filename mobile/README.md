# Chefos Mobile

React Native mobile app scaffold for the existing Chefos backend and web product.

## What is included

- Customer login and signup
- Chef partner login and registration
- Customer dashboard
- Nearby chef discovery and instant chef request
- Weekly menu screen
- Today schedule screen
- Subscription summary and backend order creation
- Chef partner dashboard for availability, location, and instant requests

## Setup

1. Install dependencies:

```bash
npm install
```

2. Point the app to the Django backend:

```bash
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.10:8000/api/
```

3. Start Expo:

```bash
npm run start:user
```

For the dedicated chef partner app:

```bash
npm run start:chef
```

## Notes

- Use a LAN IP for mobile device testing, not `localhost`.
- This repo now supports separate Expo app variants for customer and chef partner.
- The subscription screen already calls the backend order creation endpoint.
- Native Razorpay checkout is the main remaining production integration for in-app payment completion.
