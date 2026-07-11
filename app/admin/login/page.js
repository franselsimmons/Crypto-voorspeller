export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { isAdminSession } from "../../../src/security/adminSession.js";
import AdminLoginForm from "../../../components/AdminLoginForm.js";

export default function AdminLoginPage() {
  if (isAdminSession()) redirect("/admin");
  return (
    <section className="hero">
      <h1>Admin sign-in</h1>
      <p className="lead">Restricted area. Sessions last 7 days and use an HttpOnly cookie.</p>
      <div className="section" style={{ maxWidth: 460 }}>
        <AdminLoginForm />
      </div>
    </section>
  );
}
