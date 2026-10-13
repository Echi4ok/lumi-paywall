CREATE TABLE IF NOT EXISTS purchases (
  id UUID PRIMARY KEY,
  device_id UUID NOT NULL,
  request_id UUID NOT NULL,
  offer_id TEXT NOT NULL CHECK (offer_id IN ('monthly', 'yearly')),
  price_minor INTEGER NOT NULL CHECK (price_minor > 0),
  currency TEXT NOT NULL CHECK (currency = 'RUB'),
  purchased_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL CHECK (expires_at > purchased_at),
  CONSTRAINT purchases_device_request_unique UNIQUE (device_id, request_id)
);

CREATE INDEX IF NOT EXISTS purchases_device_expiry_idx
  ON purchases (device_id, expires_at DESC, purchased_at DESC, id DESC);
