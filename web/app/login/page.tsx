"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/utils/supabaseClient";
import BrandLockup from "@/components/BrandLockup";
import JaaliLoader from "@/components/JaaliLoader";

/**
 * Log in, and create account (?mode=signup). Split layout from the Bloomgard family: a Raat panel with the
 * jaali lattice on the left, the form on Kora paper on the right. Labels only, no placeholder text.
 */
export default function Login() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState<string | null>(null);

  // already signed in on this device: straight to the workspace
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("mode") === "signup") setIsSignUp(true);
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace("/dashboard");
      else setChecking(false);
    });
  }, [router]);

  const switchMode = (signup: boolean) => {
    setIsSignUp(signup); setError(null);
    window.history.replaceState(null, "", signup ? "/login?mode=signup" : "/login");
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true); setError(null);
    try {
      if (isSignUp) {
        // a new workspace with the person signing up as its admin, then sign them straight in
        const res = await fetch("/api/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ companyName, fullName, email, password }),
        });
        const out = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(out.error || "Could not create the account.");
      }
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw new Error(/invalid login/i.test(signInError.message) ? "That email and password don't match. Check them and try again." : signInError.message);
      router.replace("/dashboard");
    } catch (err: any) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  if (checking) {
    return <JaaliLoader label="Checking your session" />;
  }

  return (
    <div className="auth">
      <aside className="auth__panel" aria-hidden="true">
        <BrandLockup height={28} tone="onDark" style={{ color: "#f3ede1" }} />
        <div>
          <p className="auth__headline">Your sales desk, <em>run by AI.</em></p>
          <p className="auth__sub">Bloomgard CMA reads every client email, drafts the reply from your own catalogue and keeps every quote moving. You approve; it does the rest.</p>
        </div>
      </aside>

      <main className="auth__main">
        <div className="auth__form">
          <div className="auth__mobile-brand"><BrandLockup height={24} tone="onLight" /></div>
          <p className="auth__eyebrow">{isSignUp ? "Create account" : "Log in"}</p>
          <h1 className="auth__title">{isSignUp ? "Start your company's workspace" : "Welcome back"}</h1>
          <p className="auth__lede">
            {isSignUp
              ? "Use your company email. You become the workspace admin; add your team and shape your quote form later, or just ask Bloomgard AI."
              : "Log in to your Bloomgard CMA workspace with your email and password."}
          </p>

          {error && <div className="auth__error" role="alert">{error}</div>}

          <form onSubmit={handleAuth} className="auth__fields">
            {isSignUp && (
              <>
                <label className="auth__field"><span>Company name</span>
                  <input required value={companyName} onChange={(e) => setCompanyName(e.target.value)} autoComplete="organization" />
                </label>
                <label className="auth__field"><span>Your name</span>
                  <input required value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" />
                </label>
              </>
            )}
            <label className="auth__field"><span>{isSignUp ? "Work email" : "Email"}</span>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
              {isSignUp && <small>Your company's address. Personal addresses like Gmail or Outlook can't create a workspace.</small>}
            </label>
            <label className="auth__field"><span>Password</span>
              <span className="auth__pw">
                <input type={showPassword ? "text" : "password"} required value={password} onChange={(e) => setPassword(e.target.value)}
                  minLength={isSignUp ? 8 : undefined} autoComplete={isSignUp ? "new-password" : "current-password"} />
                <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? "Hide" : "Show"}</button>
              </span>
              {isSignUp && <small>At least 8 characters.</small>}
            </label>
            <button type="submit" disabled={submitting} className="auth__submit">
              {submitting ? (isSignUp ? "Creating your workspace…" : "Logging in…") : isSignUp ? "Create account" : "Log in"}
            </button>
          </form>

          <p className="auth__switch">
            {isSignUp
              ? <>Already have an account? <button type="button" onClick={() => switchMode(false)}>Log in</button></>
              : <>New to Bloomgard? <button type="button" onClick={() => switchMode(true)}>Create an account</button></>}
          </p>
          <p className="auth__note">{isSignUp ? "Already have a workspace at your company? Ask its admin to add you instead." : "Forgot your password? Ask your workspace admin to reset it."} <a href="https://docs.bloomgard.co/crm/getting-started/" target="_blank" rel="noopener noreferrer">Getting started</a></p>
        </div>
      </main>
    </div>
  );
}
