-- Add referral system columns to profiles table
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS referred_by TEXT;

-- Index for fast lookup when a new user signs up with a referral code
CREATE INDEX IF NOT EXISTS idx_profiles_referral_code ON public.profiles (referral_code) WHERE referral_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_referred_by ON public.profiles (referred_by) WHERE referred_by IS NOT NULL;
