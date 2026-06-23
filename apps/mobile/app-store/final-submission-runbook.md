# Our Little World Final App Store Submission Runbook

App Store Connect app: `6781823693`
Version ID: `51ac2411-cdf1-4273-84d8-49ca7781e77f`
Build ID: `95ebb0ce-c9d6-45e1-b460-082972e6337b`
Version/build: `1.1.0` / `1.1.1`

## Verified Complete

- Production iOS build uploaded to App Store Connect.
- Build `1.1.1` is `VALID`.
- Build `1.1.1` is attached to App Store version `1.1.0`.
- iPhone 6.5-inch screenshots are uploaded.
- iPad Pro 12.9-inch screenshots are uploaded.
- Description, keywords, promotional text, subtitle, support URL, copyright, category, content rights, age rating, price schedule, app icon, and privacy policy text are filled.
- App Review contact details and review notes are filled.

## Remaining Blocking Items

### 1. Initial App Availability

Open App Store Connect:

`https://appstoreconnect.apple.com/apps/6781823693/distribution/availability`

Set initial availability, typically:

- Available in United States, or all intended launch territories.
- Available in new territories: enabled if desired.

The official App Store Connect public API can edit an existing availability record, but cannot create the first availability record. `asc` also exposes an experimental private-web API for this, but it is explicitly marked unofficial/discouraged and should only be used with explicit approval.

### 2. Privacy Policy URL

Publish `app-store/privacy.html` to:

`https://ourlittleworld.me/privacy`

Then verify:

```bash
curl -s -I https://ourlittleworld.me/privacy
```

After it returns `200 OK`, set the App Store privacy URL:

```bash
/tmp/asc-2.1.1.E5E12x/asc localizations update \
  --app 6781823693 \
  --type app-info \
  --locale en-US \
  --privacy-policy-url https://ourlittleworld.me/privacy \
  --pretty
```

### 3. App Privacy Questionnaire

Open:

`https://appstoreconnect.apple.com/apps/6781823693/appPrivacy`

Confirm and publish App Privacy answers using `app-store/app-privacy-worksheet.md`. Based on current app behavior, review at least:

- Email address for authentication.
- Names, family profile data, photos, location metadata from photos, and user-created notes/letters/milestones.
- User ID/account data through Supabase auth.
- Audio data only if voice notes are actually reachable in the shipped build.
- Diagnostics only if collected by Expo, Apple, or other tooling in a way Apple requires you to disclose.
- Data is not sold and not used for third-party advertising.

### 4. What's New Warning

`asc validate` warns that `whatsNew` is empty, but Apple rejected editing that field for this initial version:

`Attribute 'whatsNew' cannot be edited at this time`

This warning may be non-blocking for the first App Store release.

## Final Validation

Run:

```bash
/tmp/asc-2.1.1.E5E12x/asc validate \
  --app 6781823693 \
  --version-id 51ac2411-cdf1-4273-84d8-49ca7781e77f \
  --platform IOS \
  --pretty
```

When blocking errors are gone, submit:

```bash
/tmp/asc-2.1.1.E5E12x/asc review submit \
  --app 6781823693 \
  --version-id 51ac2411-cdf1-4273-84d8-49ca7781e77f \
  --build 95ebb0ce-c9d6-45e1-b460-082972e6337b \
  --dry-run \
  --pretty
```

If the dry run is clean:

```bash
/tmp/asc-2.1.1.E5E12x/asc review submit \
  --app 6781823693 \
  --version-id 51ac2411-cdf1-4273-84d8-49ca7781e77f \
  --build 95ebb0ce-c9d6-45e1-b460-082972e6337b \
  --confirm \
  --pretty
```
