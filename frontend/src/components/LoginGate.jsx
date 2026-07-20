import { useState } from "react";
import { login, register } from "../api";
import { AlertIcon } from "./icons";

export default function LoginGate({ onLoggedIn }) {
  const [mode, setMode] = useState("login"); // "login" | "register"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [salonName, setSalonName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const user = mode === "register" ? await register(email, password, salonName) : await login(email, password);
      onLoggedIn(user);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  function toggleMode() {
    setMode((m) => (m === "login" ? "register" : "login"));
    setError(null);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-violet-50/60 via-white to-white px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm"
      >
        <div className="mb-5 flex items-center gap-3">
          <img src="/favicon.svg" alt="" className="h-9 w-9" />
          <div>
            <p className="text-base leading-tight font-semibold text-neutral-900">NailSocial AI</p>
            <p className="text-xs text-neutral-500">
              {mode === "register" ? "Create your salon account" : "Sign in to your salon account"}
            </p>
          </div>
        </div>

        {mode === "register" && (
          <label className="block text-sm font-medium text-neutral-700">
            Salon name
            <input
              type="text"
              value={salonName}
              onChange={(e) => setSalonName(e.target.value)}
              autoFocus
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none"
            />
          </label>
        )}

        <label className="mt-3 block text-sm font-medium text-neutral-700">
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus={mode === "login"}
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none"
          />
        </label>

        <label className="mt-3 block text-sm font-medium text-neutral-700">
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none"
          />
        </label>

        {error && (
          <p className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
            <AlertIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="mt-5 w-full rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-violet-700 disabled:opacity-50"
        >
          {submitting ? "Please wait..." : mode === "register" ? "Create account" : "Sign in"}
        </button>

        <button
          type="button"
          onClick={toggleMode}
          className="mt-3 w-full text-center text-xs text-violet-600 hover:underline"
        >
          {mode === "register" ? "Already have an account? Sign in" : "Don't have an account? Create one"}
        </button>
      </form>
    </div>
  );
}
