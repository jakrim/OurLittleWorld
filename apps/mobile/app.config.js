const appJson = require('./app.json');

const BACKGROUND_TASK_IDENTIFIER = 'com.expo.modules.backgroundtask.processing';

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
  const plugins = [...(expo.plugins || [])];
  if (!hasPlugin(plugins, 'expo-background-task')) {
    plugins.push('expo-background-task');
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
