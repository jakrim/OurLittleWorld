"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { createIcons, icons } from "lucide";

const contactEmail = process.env.NEXT_PUBLIC_OLW_CONTACT_EMAIL || "jesse.krim@gmail.com";
const checkoutLinks = {
  monthly: process.env.NEXT_PUBLIC_OLW_CHECKOUT_MONTHLY || "",
  annual: process.env.NEXT_PUBLIC_OLW_CHECKOUT_ANNUAL || "",
  gift: process.env.NEXT_PUBLIC_OLW_CHECKOUT_GIFT || "",
};
const giftCheckoutEndpoint = process.env.NEXT_PUBLIC_OLW_GIFT_CHECKOUT_ENDPOINT || "";
const partnerInquiryEndpoint = process.env.NEXT_PUBLIC_OLW_PARTNER_INQUIRY_ENDPOINT || "";

const prices: Record<string, string> = {
  monthly: "$4.99 monthly",
  annual: "$47.88 yearly",
  gift: "$48 gift year",
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
      if (planSelect && planSummary) {
        const value = planSelect.value || "gift";
        planSummary.textContent =
          value === "annual"
            ? "One year of Our Little World"
            : value === "monthly"
              ? "First month of Our Little World"
              : "Gift year of Our Little World";
        if (planPrice) planPrice.textContent = prices[value] || prices.gift;
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
        const payload = formPayload(form);

        if (kind === "self") {
          const plan = payload.plan || "annual";
          const checkoutUrl = checkoutLinks[plan as keyof typeof checkoutLinks];
          if (checkoutUrl) {
            setStatus(status, "Opening secure checkout...");
            window.location.href = appendParams(checkoutUrl, {
              prefilled_email: payload.email,
              client_reference_id: `self-${Date.now()}`,
              olw_name: payload.name,
              olw_stage: payload.stage,
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
