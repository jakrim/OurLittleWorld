import {
  corsHeaders,
  decryptCode,
  errorResponse,
  json,
  requiredEnv,
  restPatch,
  rpc,
} from '../_shared/billing.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  try {
    if (!safeEqual(req.headers.get('x-olw-worker-secret') || '', requiredEnv('OLW_EMAIL_WORKER_SECRET'))) {
      return json({ error: 'Not authorized.' }, 401);
    }

    const claimed = await rpc('claim_transactional_email_outbox', { batch_size: 20 });
    const rows = Array.isArray(claimed) ? claimed : [];
    let sent = 0;
    let failed = 0;
    for (const row of rows) {
      try {
        const providerMessageId = await deliver(row);
        await restPatch('transactional_email_outbox', `id=eq.${encodeURIComponent(row.id)}`, {
          state: 'sent',
          sent_at: new Date().toISOString(),
          provider_message_id: providerMessageId,
          last_error_code: null,
        });
        sent += 1;
      } catch (error) {
        await restPatch('transactional_email_outbox', `id=eq.${encodeURIComponent(row.id)}`, {
          state: 'failed',
          last_error_code: deliveryErrorCode(error),
        });
        failed += 1;
      }
    }

    return json({ claimed: rows.length, sent, failed });
  } catch (error) {
    return errorResponse(error);
  }
});

async function deliver(row: Record<string, any>) {
  const provider = requiredEnv('OLW_TRANSACTIONAL_EMAIL_PROVIDER').toLowerCase();
  if (provider !== 'resend') throw new Error('provider_not_configured');
  const payload = row.payload || {};
  const recipientName = String(payload.recipient_name || '').trim();
  const giverName = String(payload.giver_name || '').trim();
  const planLabel = payload.plan_key === 'gift_vault_year' ? 'Vault gift year' : 'Family gift year';

  let subject: string;
  let text: string;
  let html: string;
  if (row.message_type === 'gift_buyer_confirmation') {
    subject = 'Your Our Little World gift purchase is confirmed';
    text = `Your ${planLabel} purchase is confirmed. We will send the private redemption instructions to ${recipientName || 'the recipient'} on the selected delivery date. Contact support@ourlittleworld.me if the delivery details need to change.`;
    html = `<p>Your <strong>${escapeHtml(planLabel)}</strong> purchase is confirmed.</p><p>We will send the private redemption instructions to ${escapeHtml(recipientName || 'the recipient')} on the selected delivery date.</p><p>Contact <a href="mailto:support@ourlittleworld.me">support@ourlittleworld.me</a> if the delivery details need to change.</p>`;
  } else if (row.message_type === 'gift_recipient_delivery') {
    const code = await decryptCode(String(payload.code_ciphertext || ''));
    const note = String(payload.gift_message || '').trim();
    subject = `${giverName || 'Someone'} gifted you a private baby book`;
    text = `${giverName || 'Someone'} gave you a year of Our Little World. The app is coming soon to iPhone and Android; do not use a placeholder store link. When the app is publicly available, create your family space and redeem this code: ${code}${note ? `\n\nGift note: ${note}` : ''}\n\nAvailability: https://ourlittleworld.me/#launch-list`;
    html = `<p>${escapeHtml(giverName || 'Someone')} gave you a year of Our Little World, a private baby book.</p><p>The app is coming soon to iPhone and Android. When a verified public store listing is available, create your family space and redeem this private code:</p><p style="font-size:22px;font-weight:700;letter-spacing:1px">${escapeHtml(code)}</p>${note ? `<p><strong>Gift note</strong><br>${escapeHtml(note)}</p>` : ''}<p><a href="https://ourlittleworld.me/#launch-list">Check verified app availability</a></p>`;
  } else {
    throw new Error('unsupported_message_type');
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${requiredEnv('RESEND_API_KEY')}`,
      'content-type': 'application/json',
      'Idempotency-Key': row.idempotency_key,
    },
    body: JSON.stringify({
      from: requiredEnv('OLW_TRANSACTIONAL_FROM'),
      to: [row.recipient_email],
      reply_to: 'support@ourlittleworld.me',
      subject,
      text,
      html,
      headers: {
        'X-Entity-Ref-ID': row.id,
        'Auto-Submitted': 'auto-generated',
      },
    }),
  });
  if (!response.ok) throw new Error(`provider_${response.status}`);
  const responseBody = await response.json().catch(() => ({}));
  return typeof responseBody?.id === 'string' ? responseBody.id : row.idempotency_key;
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function safeEqual(left: string, right: string) {
  if (!left || left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return diff === 0;
}

function deliveryErrorCode(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  return /^(provider_[0-9]{3}|provider_not_configured|unsupported_message_type)$/.test(message)
    ? message
    : 'delivery_failed';
}
