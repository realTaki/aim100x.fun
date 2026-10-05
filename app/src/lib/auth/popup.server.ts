/**
 * Legacy live-preview `/auth/popup` document. Google/X OAuth through the Grok
 * broker is gone — Passkey sign-in happens on `/login`. This path only exists
 * so an old bookmark or Vite plugin hit does not 500.
 */
export async function handleAuthPopupRequest(_request: Request): Promise<Response> {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Use Passkey sign-in</title>
<style>
  html,body{margin:0;min-height:100%;background:#0b0b0c;color:#a1a1aa;
    font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
  main{min-height:100vh;display:grid;place-items:center;padding:1.5rem;text-align:center}
</style>
</head>
<body>
<main>
  <p>Sign in with a Passkey on the login page. Google and X are not used.</p>
</main>
<script>
try { if (window.opener) window.opener.postMessage({ source: "grok-auth-popup", token: null, error: "passkey_login" }, window.location.origin); } catch (e) {}
try { window.close(); } catch (e) {}
</script>
</body>
</html>`;
  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
