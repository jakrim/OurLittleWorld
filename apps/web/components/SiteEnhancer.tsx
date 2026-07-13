"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { createIcons, icons } from "lucide";

import {
  checkoutAttributionPayload,
  marketingTarget,
  trackMarketingEvent,
} from "@/lib/marketingAnalytics";
import { publicCommercialConfig } from "@/lib/commercialConfig";

const contactEmail = process.env.NEXT_PUBLIC_OLW_CONTACT_EMAIL || "support@ourlittleworld.me";
const supabaseFunctionsBase = process.env.NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL
  || (process.env.NEXT_PUBLIC_SUPABASE_URL ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1` : "");
const functionUrl = (name: string) => (supabaseFunctionsBase ? `${supabaseFunctionsBase}/${name}` : "");
const checkoutEndpoint = process.env.NEXT_PUBLIC_OLW_CHECKOUT_ENDPOINT || functionUrl("stripe-create-checkout");
const giftCheckoutEndpoint = process.env.NEXT_PUBLIC_OLW_GIFT_CHECKOUT_ENDPOINT || functionUrl("stripe-create-gift-checkout");

const prices: Record<string, string> = {
  family_monthly: "$7.99 monthly",
  family_yearly: "$69.99 yearly",
  vault_monthly: "$14.99 monthly",
  vault_yearly: "$149.99 yearly",
  gift_year: "$70 gift year",
  gift_vault_year: "$150 Vault gift year",
};

const planSummaries: Record<string, string> = {
  family_monthly: "Family plan, billed monthly",
  family_yearly: "Family plan, billed yearly",
  vault_monthly: "Vault plan, billed monthly",
  vault_yearly: "Vault plan, billed yearly",
  gift_year: "Gift year of Our Little World",
  gift_vault_year: "Vault gift year of Our Little World",
};

function formPayload(form: HTMLFormElement) {
  return Object.fromEntries(new FormData(form).entries()) as Record<string, string>;
}

function setStatus(
  status: Element | null,
  message: string,
  action?: { href: string; label: string },
) {
  if (!status) return;

  status.textContent = "";
  const text = document.createElement("span");
  text.textContent = message;
  status.append(text);

  if (action) {
    status.append(" ");
    const link = document.createElement("a");
    link.href = action.href;
    link.textContent = action.label;
    status.append(link);
  }

  status.classList.add("is-visible");
}

async function postJson(endpoint: string, payload: Record<string, string>) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) throw new Error("Request failed");

  const contentType = response.headers.get("content-type") || "";
  return contentType.includes("application/json")
    ? ((await response.json()) as { url?: string })
    : {};
}

export default function SiteEnhancer() {
  const pathname = usePathname();

  useEffect(() => {
    const cleanup: Array<() => void> = [];
    const currentPath = pathname || "/";
    const on = <K extends keyof HTMLElementEventMap>(
      element: Element | null,
      eventName: K,
      handler: (event: HTMLElementEventMap[K]) => void,
    ) => {
      if (!element) return;
      element.addEventListener(eventName, handler as EventListener);
      cleanup.push(() => element.removeEventListener(eventName, handler as EventListener));
    };

    createIcons({
      icons,
      attrs: {
        "stroke-width": 1.8,
      },
    });

    const viewEvent = currentPath === "/"
      ? "homepage_viewed"
      : currentPath.startsWith("/pricing")
        ? "pricing_viewed"
        : currentPath.startsWith("/gift")
          ? "gift_started"
          : "landing_view";
    void trackMarketingEvent(viewEvent, {
      path: currentPath,
      surface: "marketing_site",
    });

    const heroPrimary = currentPath === "/" ? document.querySelector("main a.button-primary") : null;
    document.querySelectorAll<HTMLAnchorElement>("a.button").forEach((link) => {
      on(link, "click", () => {
        void trackMarketingEvent(link === heroPrimary ? "hero_primary_cta_clicked" : "primary_cta_clicked", {
          path: currentPath,
          surface: "marketing_site",
          target: marketingTarget(link.getAttribute("href")),
        });
      });
    });

    const navToggle = document.querySelector("[data-menu-toggle]");
    const navLinks = document.querySelector("[data-nav-links]");

    on(navToggle, "click", () => {
      if (!navLinks || !navToggle) return;
      const isOpen = navLinks.classList.toggle("is-open");
      navToggle.setAttribute("aria-expanded", String(isOpen));
    });

    on(navLinks, "click", (event) => {
      const target = event.target as Element | null;
      if (!target?.closest("a") || !navToggle || !navLinks) return;
      navLinks.classList.remove("is-open");
      navToggle.setAttribute("aria-expanded", "false");
    });

    document.querySelectorAll("[data-nav-link]").forEach((link) => {
      link.removeAttribute("aria-current");
      const href = link.getAttribute("href");
      if (!href) return;
      if (href.includes("#")) return;

      const normalized = new URL(href, window.location.origin).pathname;
      if (
        (normalized === "/" && currentPath === "/") ||
        (normalized !== "/" && currentPath.startsWith(normalized.replace(/\/$/, "")))
      ) {
        link.setAttribute("aria-current", "page");
      }
    });

    document.querySelectorAll("[data-segment-group]").forEach((group) => {
      const targetSelector = group.getAttribute("data-segment-group");
      const target = targetSelector
        ? document.querySelector<HTMLInputElement | HTMLSelectElement>(targetSelector)
        : null;
      const segments = Array.from(group.querySelectorAll<HTMLElement>("[data-segment]"));

      segments.forEach((segment) => {
        on(segment, "click", () => {
          segments.forEach((item) => item.setAttribute("aria-pressed", "false"));
          segment.setAttribute("aria-pressed", "true");
          if (!target) return;
          target.value = segment.getAttribute("data-segment") || target.value;
          target.dispatchEvent(new Event("change", { bubbles: true }));
        });
      });
    });

    const planSelect = document.querySelector<HTMLInputElement | HTMLSelectElement>("[data-plan-select]");
    const planSummary = document.querySelector("[data-plan-summary]");
    const planPrice = document.querySelector("[data-plan-price]");
    const giftRecipient = document.querySelector<HTMLInputElement>("[data-gift-recipient]");
    const giftRecipientName = document.querySelector("[data-gift-recipient-name]");
    const giftNote = document.querySelector<HTMLTextAreaElement>("[data-gift-note]");
    const giftNotePreview = document.querySelector("[data-gift-note-preview]");

    const updateGiftPreview = () => {
      if (planSelect) {
        const value = planSelect.value || "gift_year";
        if (planSummary) planSummary.textContent = planSummaries[value] || planSummaries.gift_year;
        if (planPrice) planPrice.textContent = prices[value] || prices.gift_year;
      }

      if (giftRecipient && giftRecipientName) {
        giftRecipientName.textContent = giftRecipient.value.trim() || "your friend";
      }

      if (giftNote && giftNotePreview) {
        giftNotePreview.textContent =
          giftNote.value.trim() ||
          "I wanted to give you a quiet place to keep the tiny moments before they blur together.";
      }
    };

    [planSelect, giftRecipient, giftNote].forEach((field) => {
      on(field, "input", updateGiftPreview);
      on(field, "change", updateGiftPreview);
    });
    updateGiftPreview();

    if (new URLSearchParams(window.location.search).get("checkout") === "cancelled") {
      const cancellationStatus = document.querySelector("[data-conversion-form] [data-form-status]");
      setStatus(cancellationStatus, "Checkout was canceled. You were not charged and no access was created.");
      void trackMarketingEvent("checkout_failed", {
        path: currentPath,
        surface: currentPath.startsWith("/gift") ? "web_gift" : "web_pricing",
      });
    }

    document.querySelectorAll<HTMLFormElement>("[data-conversion-form]").forEach((form) => {
      const status = form.querySelector("[data-form-status]");

      on(form, "submit", async (event) => {
        event.preventDefault();
        const required = Array.from(
          form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("[required]"),
        );
        const firstInvalid = required.find((field) => !field.checkValidity());

        if (firstInvalid) {
          firstInvalid.focus();
          setStatus(status, "Please complete the highlighted field before continuing.");
          if (typeof form.reportValidity === "function") form.reportValidity();
          return;
        }

        const kind = form.getAttribute("data-conversion-form");
        if ((kind === "self" || kind === "gift") && !publicCommercialConfig.checkoutEnabled) {
          setStatus(status, "Purchases are not publicly available yet. Join the launch list for a verified availability update.", {
            label: "Join the launch list",
            href: "/#launch-list",
          });
          return;
        }
        if (form.dataset.submitting === "true") return;
        form.dataset.submitting = "true";
        const submitButton = form.querySelector<HTMLButtonElement>('button[type="submit"]');
        if (submitButton) submitButton.disabled = true;
        const unlock = () => {
          delete form.dataset.submitting;
          if (submitButton) submitButton.disabled = false;
        };
        const checkoutAttemptId = form.dataset.checkoutAttemptId || crypto.randomUUID();
        form.dataset.checkoutAttemptId = checkoutAttemptId;
        const payload: Record<string, string> = {
          ...formPayload(form),
          ...checkoutAttributionPayload(),
          checkout_attempt_id: checkoutAttemptId,
        };

        if (kind === "self") {
          const plan = payload.plan || "family_yearly";
          void trackMarketingEvent("checkout_started", {
            path: pathname || "/pricing",
            surface: "web_pricing",
            product_key: plan,
          });
          if (checkoutEndpoint) {
            try {
              setStatus(status, "Opening secure checkout...");
              const result = await postJson(checkoutEndpoint, payload);
              if (result.url) {
                window.location.href = result.url;
                return;
              }
              setStatus(status, "Checkout could not be prepared. Please try email instead.", {
                label: "Email us to start",
                href: `mailto:${contactEmail}?subject=${encodeURIComponent("Our Little World purchase support")}`,
              });
              unlock();
            } catch {
              void trackMarketingEvent("checkout_failed", {
                path: pathname || "/pricing",
                surface: "web_pricing",
                product_key: plan,
              });
              setStatus(status, "Checkout could not be prepared. Please try email instead.", {
                label: "Email us to start",
                href: `mailto:${contactEmail}?subject=${encodeURIComponent("Our Little World purchase support")}`,
              });
              unlock();
            }
            return;
          }

          setStatus(status, "Online checkout is not available yet. Email us and we can help you start.", {
            label: "Email us to start",
            href: `mailto:${contactEmail}?subject=${encodeURIComponent("Our Little World purchase support")}`,
          });
          unlock();
          return;
        }

        if (kind === "gift") {
          void trackMarketingEvent("gift_checkout_started", {
            path: pathname || "/gift",
            surface: "web_gift",
            product_key: payload.plan || "gift_year",
          });
          if (giftCheckoutEndpoint) {
            try {
              setStatus(status, "Preparing gift checkout...");
              const result = await postJson(giftCheckoutEndpoint, payload);
              if (result.url) {
                window.location.href = result.url;
                return;
              }
              setStatus(status, "Gift details were received. We will follow up with checkout.");
              unlock();
            } catch {
              void trackMarketingEvent("checkout_failed", {
                path: pathname || "/gift",
                surface: "web_gift",
                product_key: payload.plan || "gift_year",
              });
              setStatus(status, "Gift checkout could not be prepared. Please try email instead.", {
                label: "Email gift support",
                href: `mailto:${contactEmail}?subject=${encodeURIComponent("Our Little World gift support")}`,
              });
              unlock();
            }
            return;
          }

          setStatus(status, "Online gift checkout is not available yet. Email us and we can help prepare the gift.", {
            label: "Email gift support",
            href: `mailto:${contactEmail}?subject=${encodeURIComponent("Our Little World gift support")}`,
          });
          unlock();
          return;
        }
        unlock();
      });
    });

    return () => {
      cleanup.forEach((dispose) => dispose());
    };
  }, [pathname]);

  return null;
}
