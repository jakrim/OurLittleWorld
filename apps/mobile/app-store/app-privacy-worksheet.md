# Our Little World App Privacy Worksheet

App Store Connect app: `6781823693`
Bundle ID: `com.jessekrim.ourlittleworld`
Version/build reviewed: `1.1.0` / `1.1.1`
Review date: July 2, 2026

This worksheet maps the current shipped iOS code to the App Store Connect App Privacy questionnaire. It is intended as a practical checklist for the owner to confirm in App Store Connect before submission.

## Tracking

Recommended answer: No, this app does not use data for tracking.

Rationale:

- No advertising SDK, tracking SDK, analytics SDK, or cross-app/site tracking code was found in the app code or dependencies scan.
- The app does not sell user data and does not use third-party advertising.
- The published privacy policy says data is used to provide the private family timeline, library, milestones, prompts, letters, invite features, billing support, and account support.

## Data Linked to the User

Select data types below as collected and linked to the user. Recommended purpose for each: App Functionality.

| App Privacy category | Select | Source in app | Notes |
| --- | --- | --- | --- |
| Contact Info: Email Address | Yes | Supabase email one-time-password auth | Used for sign-in and account management. |
| Contact Info: Name | Yes | Family/member profile fields | The app stores display names and child/family names entered by users. If App Store Connect treats child/family names as user content instead of contact info, disclose them under Other User Content. |
| User Content: Photos or Videos | Yes | Selected/saved photos and videos in Supabase storage | Manual imports and calibrated auto-saves upload selected media to private family storage. |
| User Content: Audio Data | Yes | Voice notes attached to moments | Voice notes are reachable from the Add sheet and uploaded to private family storage. |
| User Content: Other User Content | Yes | Memory notes, daily prompt responses, firsts, letters, tags, family profile and invite details | Text users create or save inside the private family space. |
| Location: Precise Location | Yes | Photo metadata latitude/longitude when present | The app stores raw coordinates from photo library metadata when available. It does not request live device location. |
| Identifiers: User ID | Yes | Supabase auth UUIDs and family/member IDs | Used to scope private family data and access control. |
| Purchases: Purchase History | Yes | Store purchase verification and Supabase billing entitlements | Used to verify subscriptions, restore purchases, redeem codes, and provide billing support. |

For each selected data type above:

- Data used for tracking: No.
- Data linked to user identity: Yes.
- Purpose: App Functionality.
- Third-party advertising: No.
- Developer's advertising or marketing: No.
- Analytics: No, unless an analytics system is later added outside the current codebase.
- Product personalization: No, unless Apple requires this for the private timeline/date/place surfacing. The safer current interpretation is App Functionality because the data powers core private app features.

## Conditional Or Future Data Types

Review these before publishing the questionnaire:

- Camera: The app includes camera permission text for capturing a reference photo. Reference photos remain local unless the user separately saves them as moments, so no separate additional category is needed beyond permission disclosure.
- Diagnostics: No crash reporting or analytics SDK was found in the app code scan. Do not select Crash Data, Performance Data, or Other Diagnostic Data unless Expo, Apple, Supabase, or another provider is configured to collect diagnostics on the developer's behalf outside this repo.

## Data Not Found In Current Code Scan

Do not select these unless there is collection outside this codebase:

- Financial Info
- Health and Fitness
- Sensitive Info
- Contacts
- Browsing History
- Search History
- Advertising Data
- Usage Data or analytics events
- Live device location
- Third-party tracking data

## App Store Connect Checklist

1. Open `https://appstoreconnect.apple.com/apps/6781823693/appPrivacy`.
2. Confirm the app collects user data.
3. Add the data types listed in "Data Linked to the User".
4. For each data type, choose App Functionality as the purpose.
5. Mark each selected data type as linked to the user's identity.
6. Mark each selected data type as not used for tracking.
7. Confirm the app does not use tracking.
8. Publish the privacy answers.

## Owner Confirmation Needed

Before submission, the owner should confirm:

- Whether any diagnostics, analytics, or crash reporting is configured outside this repo.
- Whether the published privacy policy at `https://ourlittleworld.me/privacy/` matches these answers.
