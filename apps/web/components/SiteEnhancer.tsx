"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { createIcons, icons } from "lucide";

import { giftOfferCopy } from "@/content/giftOffer";
import {
  checkoutAttributionPayload,
  marketingTarget,
  trackMarketingEvent,
} from "@/lib/marketingAnalytics";

const contactEmail = process.env.NEXT_PUBLIC_OLW_CONTACT_EMAIL || "support@ourlittleworld.me";
const checkoutLinks = {
  monthly: process.env.NEXT_PUBLIC_OLW_CHECKOUT_MONTHLY || "",
  annual: process.env.NEXT_PUBLIC_OLW_CHECKOUT_ANNUAL || "",
  gift: process.env.NEXT_PUBLIC_OLW_CHECKOUT_GIFT || "",
};
const supabaseFunctionsBase = process.env.NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL
  || (process.env.NEXT_PUBLIC_SUPABASE_URL ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1` : "");
const functionUrl = (name: string) => (supabaseFunctionsBase ? `${supabaseFunctionsBase}/${name}` : "");
const checkoutEndpoint = process.env.NEXT_PUBLIC_OLW_CHECKOUT_ENDPOINT || functionUrl("stripe-create-checkout");
const giftCheckoutEndpoint = process.env.NEXT_PUBLIC_OLW_GIFT_CHECKOUT_ENDPOINT || functionUrl("stripe-create-gift-checkout");
const partnerInquiryEndpoint = process.env.NEXT_PUBLIC_OLW_PARTNER_INQUIRY_ENDPOINT || functionUrl("partner-inquiry");

const prices: Record<string, string> = {
  family_monthly: "$7.99 monthly",
  family_yearly: "$69.99 yearly",
  vault_monthly: "$14.99 monthly",
  vault_yearly: "$149.99 yearly",
  gift_year: giftOfferCopy.family.pillLabel,
  gift_vault_year: giftOfferCopy.vault.pillLabel,
};

const planSummaries: Record<string, string> = {
  family_monthly: "Family plan, billed monthly",
  family_yearly: "Family plan, billed yearly",
  vault_monthly: "Vault plan, billed monthly",
  vault_yearly: "Vault plan, billed yearly",
  gift_year: giftOfferCopy.family.summary,
  gift_vault_year: giftOfferCopy.vault.summary,
};

function formPayload(form: HTMLFormElement) {
  return Object.fromEntries(new FormData(form).entries()) as Record<string, string>;
}

function appendParams(url: string, params: Record<string, string | undefined>) {
  const nextUrl = new URL(url, window.location.href);
  Object.entries(params).forEach(([key, value]) => {
    if (value) nextUrl.searchParams.set(key, value);
  });
  return nextUrl.toString();
}

function mailtoUrl(subject: string, payload: Record<string, string>) {
  const body = Object.entries(payload)
    .filter(([, value]) => value)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");

  return `mailto:${contactEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
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

    void trackMarketingEvent("landing_view", {
      path: pathname || "/",
      surface: "marketing_site",
    });

    document.querySelectorAll<HTMLAnchorElement>("a.button").forEach((link) => {
      on(link, "click", () => {
        void trackMarketingEvent("primary_cta_clicked", {
          path: pathname || "/",
          surface: "marketing_site",
          target: marketingTarget(link.getAttribute("href")),
        });
      });
    });

    on(document.querySelector("[data-analytics-preferences]"), "click", () => {
      window.dispatchEvent(new Event("olw:open-analytics-preferences"));
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

    const currentPath = pathname || "/";
    document.querySelectorAll("[data-nav-link]").forEach((link) => {
      link.removeAttribute("aria-current");
      const href = link.getAttribute("href");
      if (!href) return;

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

    document.querySelectorAll<HTMLElement>("[data-plan-choice]").forEach((choice) => {
      on(choice, "click", () => {
        if (!planSelect) return;
        const plan = choice.getAttribute("data-plan-choice");
        if (!plan || !prices[plan]) return;
        planSelect.value = plan;
        document.querySelectorAll<HTMLElement>("[data-segment]").forEach((segment) => {
          segment.setAttribute("aria-pressed", String(segment.getAttribute("data-segment") === plan));
        });
        planSelect.dispatchEvent(new Event("change", { bubbles: true }));
      });
    });

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
        const payload = {
          ...formPayload(form),
          ...checkoutAttributionPayload(),
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
                href: mailtoUrl("Start Our Little World", payload),
              });
            } catch {
              setStatus(status, "Checkout could not be prepared. Please try email instead.", {
                label: "Email us to start",
                href: mailtoUrl("Start Our Little World", payload),
              });
            }
            return;
          }

          const checkoutUrl = checkoutLinks[plan as keyof typeof checkoutLinks];
          if (checkoutUrl) {
            setStatus(status, "Opening secure checkout...");
            window.location.href = appendParams(checkoutUrl, {
              prefilled_email: payload.email,
              client_reference_id: `self-${Date.now()}`,
              olw_plan: plan,
            });
            return;
          }

          setStatus(status, "Online checkout is not available yet. Email us and we can help you start.", {
            label: "Email us to start",
            href: mailtoUrl("Start Our Little World", payload),
          });
          return;
        }

        if (kind === "gift") {
          void trackMarketingEvent("gift_started", {
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
            } catch {
              setStatus(status, "Gift checkout could not be prepared. Please try email instead.", {
                label: "Email gift details",
                href: mailtoUrl("Gift Our Little World", payload),
              });
            }
            return;
          }

          if (checkoutLinks.gift) {
            setStatus(status, "Opening gift checkout...");
            window.location.href = appendParams(checkoutLinks.gift, {
              prefilled_email: payload.giver_email,
              client_reference_id: `gift-${Date.now()}`,
              giver_name: payload.giver_name,
              recipient_name: payload.recipient_name,
              recipient_email: payload.recipient_email,
              delivery_day: payload.delivery_day,
            });
            return;
          }

          setStatus(status, "Online gift checkout is not available yet. Email us and we can help prepare the gift.", {
            label: "Email gift details",
            href: mailtoUrl("Gift Our Little World", payload),
          });
          return;
        }

        if (kind === "partner") {
          if (partnerInquiryEndpoint) {
            try {
              setStatus(status, "Sending partner inquiry...");
              await postJson(partnerInquiryEndpoint, payload);
              setStatus(status, "Partner inquiry sent. We will follow up with package options.");
            } catch {
              setStatus(status, "Partner inquiry could not be sent. Please try email instead.", {
                label: "Email partner details",
                href: mailtoUrl("Our Little World partnership inquiry", payload),
              });
            }
            return;
          }

          setStatus(status, "Partner inquiry is not connected to a form endpoint yet.", {
            label: "Email partner details",
            href: mailtoUrl("Our Little World partnership inquiry", payload),
          });
        }
      });
    });

    return () => {
      cleanup.forEach((dispose) => dispose());
    };
  }, [pathname]);

  return null;
}
