# Payments API Layer

This folder isolates payment-provider integration from orders, subscriptions, and wallet logic.

## Goals

- Keep gateway-specific code in one place.
- Avoid touching order and membership business logic every time a new payment provider is added.
- Provide stable routes for checkout, verification, and webhooks.

## Current routes

- `GET /api/payments/providers`
- `POST /api/payments/checkout`
- `GET /api/payments/verify/:transactionId`
- `POST /api/payments/webhook/:provider`
- `GET /api/admin/payments`
- `PATCH /api/admin/payments`

## Current providers

- `manual`: safe placeholder provider
- `paymob`: reserved stub
- `paytabs`: reserved stub
- `custom`: reserved stub

## Recommended future flow

1. Create order or membership intent inside the app.
2. Call `POST /api/payments/checkout`.
3. Redirect to provider URL or iframe when available.
4. Receive webhook in `/api/payments/webhook/:provider`.
5. Verify transaction state using `/api/payments/verify/:transactionId`.
6. Apply business effects only after confirmed payment.
