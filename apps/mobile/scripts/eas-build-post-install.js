const fs = require('fs');
const path = require('path');

const shouldDisableNotifications = process.env.OLW_DISABLE_NOTIFICATIONS_PLUGIN === 'true';
const dryRun = process.env.OLW_DISABLE_NOTIFICATIONS_DRY_RUN === 'true';

if (!shouldDisableNotifications) {
  console.log('Leaving iOS push notification entitlements enabled.');
  process.exit(0);
}

const entitlementsPath = path.join(
  __dirname,
  '..',
  'ios',
  'OurLittleWorld',
  'OurLittleWorld.entitlements',
);

if (!fs.existsSync(entitlementsPath)) {
  throw new Error(`Expected iOS entitlements file at ${entitlementsPath}`);
}

const contents = fs.readFileSync(entitlementsPath, 'utf8');
const nextContents = contents.replace(
  /\n\s*<key>aps-environment<\/key>\s*\n\s*<string>[^<]*<\/string>/,
  '',
);

if (nextContents === contents) {
  console.log('No aps-environment entitlement found to remove.');
  process.exit(0);
}

if (dryRun) {
  console.log('Would remove aps-environment entitlement for this no-push EAS build.');
  process.exit(0);
}

fs.writeFileSync(entitlementsPath, nextContents);
console.log('Removed aps-environment entitlement for this no-push EAS build.');
