# Account Deletion Policy

Status: policy and implementation task. The destructive flow is not implemented in
this PRD pass.

Tracked implementation task: **K7/J3 Delete account flow**.

## Required Product Flow

1. Settings exposes **Delete account** before public scale.
2. The first screen offers export before deletion and explains what will and will not
   be removed.
3. The final confirmation is explicit and destructive.
4. The backend classifies the requester role before deleting anything.
5. The backend writes a non-content deletion audit row, performs the allowed deletes,
   deletes or anonymizes the auth user, and returns a completion state.

This flow must never imply that camera-roll originals on a parent's device are
deleted. Only Our Little World account, family, and stored media data are in scope.

## Role Policy

### Sole Parent Or Sole Writer

- Delete the auth user after the family deletion transaction is accepted.
- Delete family-owned content from app tables where no other writer remains:
  moments, moment media rows, firsts, letters, prompt responses, digests, memories,
  invites, reactions, separately authored annotations, grounded context facts,
  automatic collections and memberships, saved-event groups and memberships,
  notifications, push tokens, ritual settings, recognition trust, and local/server
  reference metadata.
- Delete stored media derivatives and originals controlled by the app: Supabase
  Storage objects, Cloudflare Stream assets, and R2 objects.
- Leave billing/legal records required for tax, fraud, refund, chargeback, legal, or
  abuse-prevention obligations.
- Gift entitlements redeemed into that family end with the deleted family. Unredeemed
  purchased gifts remain purchaser/billing records until redeemed, refunded, expired,
  or legally retained.

### Co-Parent Or Additional Writer

- Remove the requester from the family and delete their auth user, push tokens,
  device/session records, and private profile data.
- Keep shared family book content for remaining writers. Content saved into the
  family book remains family-owned unless a separate legal/privacy request requires
  specific authored rows to be removed.
- Preserve family-owned collections, context, event grouping, originals, and other
  writers' annotations. Delete the requester's private device ledger and local drafts;
  anonymize or null their shared author references where feasible without breaking
  the remaining family's record. Do not reassign their words or voice to another
  writer.
- Billing ownership must be transferred, canceled, or left with the remaining billing
  owner according to the provider state before deleting provider identifiers.

### Circle Or Read-Only Member

- Remove family membership/invites for the requester.
- Delete the requester's auth user, push tokens, and notification rows.
- Do not delete family moments, firsts, digests, letters, media, billing state, or
  gift entitlements. Circle members never own private candidate ledgers, collection
  corrections, or shared annotations.

## Billing, Gifts, And Legal Retention

- Stripe, Apple, and other payment-provider records are not directly deleted by the
  app flow. Keep only the minimum local billing identifiers needed for receipts,
  refunds, disputes, taxes, fraud prevention, entitlement reconciliation, and legal
  obligations.
- Redeemed gift access is tied to the family. If the family is deleted by its sole
  writer, access ends with that family.
- Partner or employer gift package metadata may be retained as billing/legal records
  without retaining memory content.
- Support/deletion request logs must not include memory content. They may retain
  requester id, family id, role, timestamps, deletion outcome, and legal hold status.

## Auth And Storage Deletion

- Auth deletion requires Supabase admin/server credentials and must run only from a
  backend function, never the client.
- Storage deletion must enumerate app-owned paths by family id and media-session
  metadata. It must delete thumbnails, full-size app copies, video posters, Stream
  assets, R2 objects, and queued upload leftovers controlled by the app.
- Backups and provider logs may retain deleted data until normal backup/log expiry;
  they must not be restored into production except for disaster recovery or legal
  obligations.

## Implementation Acceptance

- Settings has a Delete account entry.
- The edge function handles sole writer, additional writer, and circle-member paths.
- Unit or integration tests cover role classification and no cross-family deletion.
- A storage deletion test proves only app-owned objects for the target family are
  selected.
- Shared annotation voice objects and temporary private voice drafts follow their
  owning record/device cleanup path; exact-match grouping digests are deleted with
  their family event groups and never appear in a user export.
- The flow clears push tokens and notification rows.
- The flow preserves required billing/legal records while deleting memory content.
- Product copy states that camera-roll originals are not deleted.
