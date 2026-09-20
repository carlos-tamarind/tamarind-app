CREATE TABLE public.signup_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_hash text NOT NULL,
  ip_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_signup_attempts_email_hash_created_at
  ON public.signup_attempts (email_hash, created_at DESC);
CREATE INDEX idx_signup_attempts_ip_hash_created_at
  ON public.signup_attempts (ip_hash, created_at DESC);

GRANT ALL ON public.signup_attempts TO service_role;

ALTER TABLE public.signup_attempts ENABLE ROW LEVEL SECURITY;
