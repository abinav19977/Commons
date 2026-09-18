import LoginForm from "./login-form";
export const dynamic = "force-dynamic";
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ return_to?: string }> }) {
  const { return_to } = await searchParams;
  const returnTo = return_to?.startsWith("/") ? return_to : "/";
  return <main className="form-shell"><section className="customer-form-wrap accounting-surface">
    <div className="surface-heading"><span>Commons</span><h1>Sign in to your workspace.</h1></div>
    <LoginForm returnTo={returnTo} />
  </section></main>;
}
