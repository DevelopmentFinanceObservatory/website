-- Password-era accounts (no verification step existed) are blocked from social sign-in by Better Auth's requireLocalEmailVerified guard, so this grandfathers them in.
-- Safe as a one-time fix: password sign-up is gone, so no path creates unverified accounts anymore, and the guard stays armed.
-- Scoped to users whose only sign-in method is the retired credential provider.
UPDATE "user" SET email_verified = true
WHERE email_verified = false
  AND id IN (
    SELECT user_id FROM account GROUP BY user_id HAVING bool_and(provider_id = 'credential')
  );