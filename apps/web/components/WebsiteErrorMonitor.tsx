"use client";

import { useEffect } from "react";

import { publicCommercialConfig } from "@/lib/commercialConfig";

const MAX_REPORTS_PER_PAGE = 6;

type OperationalEventType =
  | "client_error"
  | "unhandled_rejection"
  | "resource_error"
  | "form_submit"
  | "form_success"
  | "form_error";

export default function WebsiteErrorMonitor() {
  useEffect(() => {
    const endpoint = publicCommercialConfig.websiteHealthEndpoint;
    if (!endpoint) return;
    const sent = new Set<string>();

    function report(payload: {
      event_type: OperationalEventType;
      error_name: string;
      source_path?: string;
      line_bucket?: number;
    }) {
      const body = JSON.stringify({
        ...payload,
        path: window.location.pathname,
        release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || "",
      });
      if (sent.size >= MAX_REPORTS_PER_PAGE || sent.has(body)) return;
      sent.add(body);
      void fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => undefined);
    }

    function onError(event: ErrorEvent | Event) {
      if (event instanceof ErrorEvent) {
        report({
          event_type: "client_error",
          error_name: safeName(event.error?.name || "Error"),
          source_path: sameOriginPath(event.filename),
          line_bucket: Math.floor(Math.max(0, event.lineno || 0) / 10) * 10,
        });
        return;
      }
      const element = event.target;
      if (!(element instanceof HTMLImageElement || element instanceof HTMLScriptElement || element instanceof HTMLLinkElement)) return;
      const source = element instanceof HTMLLinkElement ? element.href : element.src;
      report({
        event_type: "resource_error",
        error_name: element.tagName,
        source_path: sameOriginPath(source),
      });
    }

    function onUnhandledRejection(event: PromiseRejectionEvent) {
      const reason = event.reason;
      report({
        event_type: "unhandled_rejection",
        error_name: safeName(reason instanceof Error ? reason.name : "PromiseRejection"),
      });
    }

    function onOperationalEvent(event: Event) {
      if (!(event instanceof CustomEvent) || !event.detail || typeof event.detail !== "object") return;
      const detail = event.detail as { event_type?: string; error_name?: string };
      if (!["form_submit", "form_success", "form_error"].includes(detail.event_type || "")) return;
      report({
        event_type: detail.event_type as OperationalEventType,
        error_name: safeName(detail.error_name || "LaunchSignup"),
      });
    }

    window.addEventListener("error", onError, true);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    window.addEventListener("olw:operational", onOperationalEvent);
    return () => {
      window.removeEventListener("error", onError, true);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
      window.removeEventListener("olw:operational", onOperationalEvent);
    };
  }, []);

  return null;
}

function sameOriginPath(value: string) {
  try {
    const url = new URL(value, window.location.origin);
    return url.origin === window.location.origin ? url.pathname : "";
  } catch {
    return "";
  }
}

function safeName(value: string) {
  const normalized = String(value || "UnknownError").replace(/[^A-Za-z0-9_.:-]/g, "").slice(0, 80);
  return normalized || "UnknownError";
}
