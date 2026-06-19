CREATE TABLE orders (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    amount_usd DECIMAL(10, 2),
    status TEXT DEFAULT 'pending', -- 'pending', 'completed', 'cancelled', 'shipped'
    payment_method TEXT,
    stripe_session_id TEXT,
    shipping_address JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own orders" ON orders
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all orders" ON orders
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM user_stats
            WHERE user_stats.user_id = auth.uid() AND user_stats.role = 'admin'
        )
    );

CREATE OR REPLACE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE UNIQUE INDEX IF NOT EXISTS orders_stripe_session_id_key
ON orders (stripe_session_id);

CREATE INDEX IF NOT EXISTS orders_payment_method_idx
ON orders (payment_method);
