"use client";

import { usePathname } from "next/navigation";
import { useRef, useState, type ReactNode } from "react";
import { fieldErrors, LIMITS, type FieldErrors } from "@/lib/request";

type Status = "idle" | "sending" | "sent" | "error";

const field =
  "w-full rounded-xl border border-line bg-bg px-3 py-2.5 text-base outline-none transition-[border-color,box-shadow] placeholder:text-muted focus:border-accent focus:ring-4 focus:ring-accent/15 aria-[invalid=true]:border-danger";

/** The message under a field that failed, tied to it for screen readers. */
function FieldError({ id, children }: { id: string; children?: string }) {
  if (!children) return null;
  return (
    <span id={id} className="mt-1 block text-sm font-medium text-danger">
      {children}
    </span>
  );
}

/**
 * "Request a restaurant": a link-styled button that opens a small form, which
 * lands in the maintainer's inbox via /api/request.
 *
 * A native <dialog> opened with showModal(), so focus is trapped, Escape
 * closes it and the page behind is inert without any of that hand-built.
 * `initial` prefills the name -- from a search that found nothing, it is the
 * thing the visitor just typed.
 */
export default function RequestRestaurant({
  initial = "",
  className,
  children,
}: {
  initial?: string;
  className?: string;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const opened = useRef(0);
  const form = useRef<HTMLFormElement>(null);
  const pathname = usePathname();
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [name, setName] = useState(initial);
  const [invalid, setInvalid] = useState<FieldErrors>({});

  function open() {
    // Reopening keeps whatever was typed -- closing by accident must not cost
    // a half-written request. Only a request that went through starts over.
    if (status === "sent") {
      setStatus("idle");
      form.current?.reset();
      setName(initial.trim());
    } else if (!name.trim()) {
      setName(initial.trim());
    }
    opened.current = Date.now();
    dialog.current?.showModal();
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    // Our own checks, the same ones the server runs, with our own words under
    // the field -- the form is noValidate, so the browser's bubbles never show.
    const errs = fieldErrors({ restaurant: f.get("restaurant"), email: f.get("email") });
    setInvalid(errs);
    const first = (["restaurant", "email"] as const).find((k) => errs[k]);
    if (first) {
      e.currentTarget.querySelector<HTMLInputElement>(`[name="${first}"]`)?.focus();
      return;
    }
    setStatus("sending");
    setError("");
    try {
      const res = await fetch("/api/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restaurant: f.get("restaurant"),
          city: f.get("city"),
          email: f.get("email"),
          note: f.get("note"),
          website: f.get("website"),
          elapsed: Date.now() - opened.current,
          from: pathname,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "It didn't go through. Please try again.");
      setStatus("sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "It didn't go through. Please try again.");
      setStatus("error");
    }
  }

  return (
    <>
      <button type="button" onClick={open} className={className}>
        {children}
      </button>

      <dialog
        ref={dialog}
        aria-labelledby="request-title"
        // No close on a backdrop tap: on a phone, a thumb that misses a field
        // lands there, and that used to throw the request away. The × and
        // Escape close it, and either way what was typed is kept.
        className="m-auto w-[min(28rem,calc(100%-2rem))] rounded-2xl border border-line bg-surface p-0 text-left text-base font-normal text-fg shadow-2xl backdrop:bg-black/50 backdrop:backdrop-blur-sm"
      >
        <div className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <h2 id="request-title" className="text-lg font-bold tracking-tight">
              Request a restaurant
            </h2>
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              aria-label="Close"
              className="-mr-2 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xl leading-none text-muted hover:bg-surface-2 hover:text-fg"
            >
              ×
            </button>
          </div>

          {status === "sent" ? (
            <div className="mt-3 space-y-4">
              <p className="text-[15px] leading-relaxed">
                Thanks for the request! If they publish their nutrition info,
                I&rsquo;ll work on adding them.
              </p>
              <button
                type="button"
                onClick={() => dialog.current?.close()}
                className="min-h-11 w-full rounded-xl bg-accent px-4 font-semibold text-on-accent hover:bg-accent-strong"
              >
                Done
              </button>
            </div>
          ) : (
            <form ref={form} onSubmit={submit} noValidate className="mt-3 space-y-3">
              <p className="text-sm leading-relaxed text-muted">
                Tell me which chain you&rsquo;d like to see. It comes straight
                to me, and only the details you enter here are sent.
              </p>

              <label className="block">
                <span className="mb-1 block text-sm font-medium">Restaurant</span>
                <input
                  suppressHydrationWarning // Chrome iOS autofill injects __gcruniqueid
                  name="restaurant"
                  maxLength={LIMITS.restaurant}
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setInvalid((v) => ({ ...v, restaurant: undefined }));
                  }}
                  placeholder="e.g. Sweetgreen"
                  aria-invalid={!!invalid.restaurant}
                  aria-describedby={invalid.restaurant ? "req-restaurant-err" : undefined}
                  className={field}
                />
                <FieldError id="req-restaurant-err">{invalid.restaurant}</FieldError>
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium">
                  City <span className="font-normal text-muted">(optional)</span>
                </span>
                <input
                  suppressHydrationWarning // Chrome iOS autofill injects __gcruniqueid
                  name="city"
                  maxLength={LIMITS.city}
                  placeholder="Helps with regional chains"
                  className={field}
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium">
                  Your email <span className="font-normal text-muted">(optional)</span>
                </span>
                <input
                  suppressHydrationWarning // Chrome iOS autofill injects __gcruniqueid
                  name="email"
                  type="email"
                  maxLength={LIMITS.email}
                  autoComplete="email"
                  placeholder="To hear when it's added"
                  onChange={() => setInvalid((v) => ({ ...v, email: undefined }))}
                  aria-invalid={!!invalid.email}
                  aria-describedby={invalid.email ? "req-email-err" : undefined}
                  className={field}
                />
                <FieldError id="req-email-err">{invalid.email}</FieldError>
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium">
                  Anything else <span className="font-normal text-muted">(optional)</span>
                </span>
                <textarea
                  suppressHydrationWarning // Chrome iOS autofill injects __gcruniqueid
                  name="note"
                  rows={2}
                  maxLength={LIMITS.note}
                  placeholder="A favourite order, or where they publish nutrition"
                  className={`${field} resize-none`}
                />
              </label>

              {/* The honeypot. Hidden from people and from screen readers;
                  a bot filling every field it finds fills this one too. */}
              <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
                <label>
                  Website
                  <input name="website" tabIndex={-1} autoComplete="off" suppressHydrationWarning />
                </label>
              </div>

              {status === "error" && (
                <p
                  role="alert"
                  className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm font-medium"
                >
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={status === "sending"}
                className="min-h-11 w-full rounded-xl bg-accent px-4 font-semibold text-on-accent transition-colors hover:bg-accent-strong disabled:opacity-60"
              >
                {status === "sending" ? "Sending…" : "Send request"}
              </button>
            </form>
          )}
        </div>
      </dialog>
    </>
  );
}
