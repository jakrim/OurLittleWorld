const appJson = require('./app.json');

const BACKGROUND_TASK_IDENTIFIER = 'com.expo.modules.backgroundtask.processing';
const NOTIFICATION_DEFAULT_CHANNEL = 'family-updates';

function unique(list) {
  return [...new Set((list || []).filter(Boolean))];
}

function hasPlugin(plugins, name) {
  return (plugins || []).some((plugin) => {
    if (typeof plugin === 'string') return plugin === name;
    return Array.isArray(plugin) && plugin[0] === name;
  });
}

module.exports = ({ config }) => {
  const expo = appJson.expo || {};
  const disableNotificationsPlugin = process.env.OLW_DISABLE_NOTIFICATIONS_PLUGIN === 'true';
  let plugins = [...(expo.plugins || [])];
  if (!hasPlugin(plugins, 'expo-background-task')) {
    plugins.push('expo-background-task');
  }
  if (disableNotificationsPlugin) {
    // Dev-only escape hatch for ad hoc profiles that do not have APNs enabled.
    plugins = plugins.filter((plugin) => {
      if (typeof plugin === 'string') return plugin !== 'expo-notifications';
      return !Array.isArray(plugin) || plugin[0] !== 'expo-notifications';
    });
  } else if (!hasPlugin(plugins, 'expo-notifications')) {
    plugins.push([
      'expo-notifications',
      {
        defaultChannel: NOTIFICATION_DEFAULT_CHANNEL,
        color: '#7C4A5A',
      },
    ]);
  }

  return {
    ...config,
    ...expo,
    plugins,
    ios: {
      ...(expo.ios || {}),
      infoPlist: {
        ...(expo.ios?.infoPlist || {}),
        UIBackgroundModes: unique([
          ...(expo.ios?.infoPlist?.UIBackgroundModes || []),
          'processing',
        ]),
        BGTaskSchedulerPermittedIdentifiers: unique([
          ...(expo.ios?.infoPlist?.BGTaskSchedulerPermittedIdentifiers || []),
          BACKGROUND_TASK_IDENTIFIER,
        ]),
      },
    },
  };
};
