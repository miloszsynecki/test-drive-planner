# Test Drive Route Planner (Google Maps)

Single-page Next.js app for generating circular test-drive routes from dealership address.

## Setup

1. Install deps:

```bash
npm install
```

2. Create `.env.local`:

```env
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_google_maps_api_key
```

3. Run app:

```bash
npm run dev
```

4. Open `http://localhost:3000`

## Google Cloud Setup (cheap mode)

1. Create/select project in Google Cloud Console.
2. Enable billing on project.
3. Enable APIs:
- Maps JavaScript API
- Directions API
- Places API

4. Create API key.
5. Restrict key (very important):
- Application restrictions: `HTTP referrers`
- Allowed referrers:
  - `http://localhost:3000/*`
  - `https://your-domain.com/*`
- API restrictions: limit key to only:
  - Maps JavaScript API
  - Directions API
  - Places API

6. Budget and quota controls:
- Set Billing budget alerts: `$5`, `$10`, `$25`.
- Set per-API daily quotas (start low, raise later).

## Cost Minimization Used In App

- Autocomplete uses session token (lower Places cost pattern).
- Route API call only on `Generate Route` click.
- No Geocoding API dependency.
- Fallback address resolution uses Places `findPlaceFromQuery` only when user pasted address without selecting dropdown.

## Notes

- Pricing changes over time; check official pricing/SKU docs before production launch.
- Old `$200 monthly credit` program ended in past; now use SKU free caps + pay-as-you-go/subscription model.
