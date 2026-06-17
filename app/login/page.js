"use client";

import Link from "next/link";

export default function LoginPage() {
  return (
    <main className="login-screen">
      <section className="login-panel">
        <div>
          <p className="login-eyebrow">SWAIS</p>
          <h1>Login</h1>
          <p>You have been logged out of the student dashboard.</p>
        </div>
        <div className="login-form-shell">
          <label>
            <span>Email / Admission No.</span>
            <input type="text" placeholder="Enter email or admission number" />
          </label>
          <label>
            <span>Password</span>
            <input type="password" placeholder="Enter password" />
          </label>
          <Link className="primary-button login-button" href="/">
            Continue to Dashboard
          </Link>
        </div>
      </section>
    </main>
  );
}
