const fs = require('fs');
const path = require('path');
const { withDangerousMod, withInfoPlist } = require('expo/config-plugins');

const sceneManifest = {
  UIApplicationSupportsMultipleScenes: false,
  UISceneConfigurations: {
    UIWindowSceneSessionRoleApplication: [
      {
        UISceneConfigurationName: 'Default Configuration',
        UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate',
      },
    ],
  },
};

function addSceneLifecycle(appDelegate) {
  if (appDelegate.includes('class SceneDelegate: UIResponder, UIWindowSceneDelegate')) {
    return appDelegate;
  }

  let contents = appDelegate.replace(
    `#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif`,
    `#if os(iOS) || os(tvOS)
    if #unavailable(iOS 13.0, tvOS 13.0) {
      window = UIWindow(frame: UIScreen.main.bounds)
      factory.startReactNative(
        withModuleName: "main",
        in: window,
        launchOptions: launchOptions)
    }
#endif`,
  );

  contents = contents.replace(
    `  // Linking API
  public override func application(`,
    `  public func application(
    _ application: UIApplication,
    configurationForConnecting connectingSceneSession: UISceneSession,
    options: UIScene.ConnectionOptions
  ) -> UISceneConfiguration {
    let configuration = UISceneConfiguration(name: "Default Configuration", sessionRole: connectingSceneSession.role)
    configuration.delegateClass = SceneDelegate.self
    return configuration
  }

  // Linking API
  public override func application(`,
  );

  return contents.replace(
    `}

class ReactNativeDelegate: ExpoReactNativeFactoryDelegate {`,
    `}

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene,
          let appDelegate = UIApplication.shared.delegate as? AppDelegate,
          let factory = appDelegate.reactNativeFactory else {
      return
    }

    let window = UIWindow(windowScene: windowScene)
    self.window = window
    appDelegate.window = window

    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: nil)

    connectionOptions.urlContexts.forEach { openURLContext in
      _ = appDelegate.application(UIApplication.shared, open: openURLContext.url, options: [:])
    }

    connectionOptions.userActivities.forEach { userActivity in
      _ = appDelegate.application(UIApplication.shared, continue: userActivity, restorationHandler: { _ in })
    }
  }

  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    guard let appDelegate = UIApplication.shared.delegate as? AppDelegate else {
      return
    }

    URLContexts.forEach { openURLContext in
      _ = appDelegate.application(UIApplication.shared, open: openURLContext.url, options: [:])
    }
  }

  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    guard let appDelegate = UIApplication.shared.delegate as? AppDelegate else {
      return
    }

    _ = appDelegate.application(UIApplication.shared, continue: userActivity, restorationHandler: { _ in })
  }
}

class ReactNativeDelegate: ExpoReactNativeFactoryDelegate {`,
  );
}

module.exports = function withIosSceneLifecycle(config) {
  config = withInfoPlist(config, (config) => {
    config.modResults.UIApplicationSceneManifest = sceneManifest;
    return config;
  });

  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const appDelegatePath = path.join(
        config.modRequest.platformProjectRoot,
        config.modRequest.projectName,
        'AppDelegate.swift',
      );
      const appDelegate = await fs.promises.readFile(appDelegatePath, 'utf8');
      await fs.promises.writeFile(appDelegatePath, addSceneLifecycle(appDelegate));
      return config;
    },
  ]);
};
