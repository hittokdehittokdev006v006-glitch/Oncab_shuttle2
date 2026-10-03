# PayU integration

## Server configuration

Set these variables in the API server environment. Do not send the salt to a browser/mobile client or store it in `system_settings`.

```env
PAYU_KEY=your_merchant_key
PAYU_SALT=your_merchant_salt
PAYU_CHECKOUT_URL=https://test.payu.in/_payment
PAYU_API_URL=https://test.payu.in/merchant/postservice.php?form=2
PAYU_CALLBACK_URL=https://your-api.example.com/api2/bus/payment/payu-callback
PAYU_RETURN_URL=https://your-app.example.com/payment-result
```

For production, replace test PayU URLs with the production URLs provided for the merchant account. Configure the callback URL in PayU as well. Restart the API after changing environment variables.

## Database

Apply `migrations/payu_gateway.sql` once before deploying this code. It adds PayU identifiers to `payments` and gateway response data to `refunds`. Existing Razorpay columns remain for historical rows; they are no longer used for new payments.

## User checkout API

After creating a booking, call:

```http
POST /api2/bus/payment/payu/initiate
Content-Type: application/json

{"booking_id":123,"passenger_mobile":"9876543210"}
```

The response contains `data.action`, `data.method`, and `data.fields`. Submit those fields as an HTML form POST (or the equivalent native WebView/browser form post) to the returned PayU action URL. Do not mark a booking paid in the client. PayU posts the result to `PAYU_CALLBACK_URL`; the server verifies the response hash and amount before updating the booking/payment status. PayU then redirects to `PAYU_RETURN_URL` with the result and transaction identifiers.

The merchant salt is never included in the initiation response.

## Refunds

For a paid PayU booking, an authorized operator submits the existing `PATCH /api2/refunds/:id/process` action. The server initiates a PayU refund and stores it as `processing`. Use `PATCH /api2/refunds/:id/verify-payu` to query PayU; only a gateway-confirmed completed refund updates the payment and booking to `refunded` (or `partial_refund`).

A PayU refund cannot be issued for old transactions without a stored PayU `mihpayid`; those need to be handled through the merchant dashboard or reconciled to a PayU transaction first.
