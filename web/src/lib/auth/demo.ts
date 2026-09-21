/** The shared demo owner login (portfolio demo only, 04 §Auth). Both vars or nothing. */
export function demoCredentials(): { email: string; password: string } | null {
  const email = process.env.NEXT_PUBLIC_DEMO_EMAIL;
  const password = process.env.NEXT_PUBLIC_DEMO_PASSWORD;
  return email && password ? { email, password } : null;
}
