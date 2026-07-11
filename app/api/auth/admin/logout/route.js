export const dynamic = "force-dynamic";

export async function POST() {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": `ars_admin=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`,
    },
  });
}
