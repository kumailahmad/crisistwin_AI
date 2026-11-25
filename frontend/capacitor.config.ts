// Capacitor Android & native shell configuration for CrisisTwin AI.
// Build workflow:
// 1. npm run build (or set server.url for live hosted origin)
// 2. npx cap sync android
// 3. npx cap open android

const capacitorConfig = {
  appId: "pk.crisistwin.app",
  appName: "CrisisTwin AI",
  webDir: "out",
  server: {
    // Set CAPACITOR_SERVER_URL to the deployed HTTPS origin when packaging a remote-hosted Android WebView APK.
    url: process.env.CAPACITOR_SERVER_URL || undefined,
    androidScheme: "https",
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: "#050b17",
      androidScaleType: "CENTER_CROP",
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default capacitorConfig;
