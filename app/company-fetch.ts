export async function companyFetch(input: RequestInfo | URL, init?: RequestInit) {
  const company = document.querySelector<HTMLMetaElement>('meta[name="commons-company"]')?.content;
  const headers = new Headers(init?.headers);
  if (company) headers.set("x-commons-company", company);
  const response = await fetch(input, {...init, headers, cache:"no-store"});
  if (response.status === 401) return new Response(JSON.stringify({message:"Your company selection or sign-in changed. Open Company profiles, select the company, and reload this form before saving."}), {status:401,headers:{"Content-Type":"application/json"}});
  return response;
}
