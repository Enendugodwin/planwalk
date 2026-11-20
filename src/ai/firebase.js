import { store } from "../store.js";

const CONFIG_KEY = "planwalk.firebase.v1";
const DEBUG_TOKEN_KEY = "planwalk.appcheck.debugtoken.v1";
const DEFAULT_CLOUD_MODEL = "gemini-4-hydrogen";

let sdkCache = null;
const modelCache = new Map();
const preparedModels = new WeakSet();

/** A stable, local App Check debug token so it can be shown in the UI. */
export function getDebugToken() {
  try {
    const existing = localStorage.getItem(DEBUG_TOKEN_KEY);
    if (existing) return existing;
    const token =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `planwalk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(DEBUG_TOKEN_KEY, token);
    return token;
  } catch {
    return `planwalk-${Date.now().toString(36)}`;
  }
}

/** Prefer a token pinned in config (useful for a stable local setup). */
export function getAppCheckDebugToken() {
  const settings = getFirebaseSettings();
  const configured = settings.config?.appCheckDebugToken;
  if (typeof configured === "string" && configured.trim()) return configured.trim();
  return getDebugToken();
}

function parseConfig(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function readStored() {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Firebase settings, with a localStorage override taking precedence over env. */
export function getFirebaseSettings() {
  const stored = readStored();
  const envConfig = parseConfig(import.meta.env.VITE_FIREBASE_CONFIG);
  const windowConfig = parseConfig(typeof window !== "undefined" ? window.PLANWALK_FIREBASE_CONFIG : null);
  const config = parseConfig(stored?.config) || envConfig || windowConfig || null;
  const cloudModel =
    stored?.cloudModel ||
    import.meta.env.VITE_FIREBASE_CLOUD_MODEL ||
    (config && typeof config.cloudModel === "string" ? config.cloudModel : "") ||
    "";
  const valid = Boolean(config && config.apiKey && config.projectId && config.appId);
  return {
    config: valid ? config : null,
    rawConfig: config,
    cloudModel: String(cloudModel || "").trim(),
    source: stored?.config ? "browser" : envConfig ? "environment" : windowConfig ? "page" : null,
  };
}

export function saveFirebaseSettings(configInput, cloudModel = "") {
  const config = parseConfig(configInput);
  if (!config || !config.apiKey || !config.projectId || !config.appId) {
    throw new Error("Config needs at least apiKey, projectId and appId.");
  }
  localStorage.setItem(CONFIG_KEY, JSON.stringify({ config, cloudModel: String(cloudModel || "").trim() }));
  resetAI();
  store.setAI({ consent: false, planConsentSession: false });
  return getFirebaseSettings();
}

export function clearFirebaseSettings() {
  localStorage.removeItem(CONFIG_KEY);
  resetAI();
  store.setAI({ consent: false, planConsentSession: false });
}

export function resetAI() {
  sdkCache = null;
  modelCache.clear();
}

export async function getDeviceSupport() {
  const supported =
    typeof window !== "undefined" && Boolean(window.LanguageModel || window.ai?.languageModel);
  let availability = "unsupported";
  if (supported) {
    try {
      const ctor = window.LanguageModel || window.ai?.languageModel;
      availability = (await ctor.availability?.()) || "unknown";
    } catch {
      availability = "unknown";
    }
  }
  const chromeMatch = String(navigator.userAgent || "").match(/Chrome\/(\d+)/);
  return {
    supported,
    availability,
    chromeVersion: chromeMatch ? Number(chromeMatch[1]) : null,
    isChromeDesktop: /Chrome\//.test(navigator.userAgent) && !/Mobile|Android|iPhone|iPad/.test(navigator.userAgent),
  };
}

async function loadFirebase() {
  const settings = getFirebaseSettings();
  if (!settings.config) {
    throw new AIUnavailableError(
      "Firebase AI Logic isn't configured.",
      "Open AI settings to add your Firebase web-app config. Manual editing and rule-based prompts still work."
    );
  }
  if (sdkCache && sdkCache.configKey === JSON.stringify(settings.config)) return sdkCache;

  let appSdk;
  let aiSdk;
  let appCheckSdk = null;
  try {
    [appSdk, aiSdk] = await Promise.all([import("firebase/app"), import("firebase/ai")]);
  } catch (error) {
    throw new AIUnavailableError(
      "The Firebase SDK could not be loaded.",
      "Check your network connection, then try again."
    );
  }

  const config = { ...settings.config };
  delete config.cloudModel;
  delete config.debugAppCheck;
  delete config.appCheckDebugToken;
  delete config.recaptchaSiteKey;

  // A config change can leave an older SDK app registered; clear any
  // Planwalk-named apps before creating the new one.
  try {
    const stale = appSdk.getApps().filter((existing) => existing.name.startsWith("planwalk"));
    await Promise.all(stale.map((existing) => appSdk.deleteApp(existing)));
  } catch (error) {
    console.warn("[planwalk] could not reset previous Firebase app", error);
  }

  const app = appSdk.initializeApp(config, "planwalk");

  let appCheckDebugToken = null;
  if (settings.config.debugAppCheck) {
    try {
      const token =
        typeof settings.config.appCheckDebugToken === "string" &&
        settings.config.appCheckDebugToken.trim()
          ? settings.config.appCheckDebugToken.trim()
          : getDebugToken();
      self.FIREBASE_APPCHECK_DEBUG_TOKEN = token;
      appCheckDebugToken = token;
    } catch {
      /* ignore */
    }
  }

  if (settings.config.debugAppCheck || settings.config.recaptchaSiteKey) {
    try {
      appCheckSdk = await import("firebase/app-check");
      const provider = settings.config.recaptchaSiteKey
        ? new appCheckSdk.ReCaptchaEnterpriseProvider(settings.config.recaptchaSiteKey)
        : new appCheckSdk.CustomProvider({
            // In App Check debug mode the SDK exchanges the debug token and
            // never calls this provider. It exists only to satisfy init.
            getToken: async () => ({
              token: "planwalk-debug-provider",
              expireTimeMillis: Date.now() + 60 * 60 * 1000,
            }),
          });
      appCheckSdk.initializeAppCheck(app, {
        provider,
        isTokenAutoRefreshEnabled: true,
      });
    } catch (error) {
      console.warn("[planwalk] App Check init failed", error);
    }
  }

  const ai = aiSdk.getAI(app, { backend: new aiSdk.GoogleAIBackend() });
  sdkCache = {
    app,
    ai,
    sdk: aiSdk,
    settings,
    configKey: JSON.stringify(settings.config),
    appCheckReady: Boolean(appCheckSdk),
    appCheckDebugToken,
  };
  return sdkCache;
}

async function ensureModel(schema, { preferCloud = false } = {}) {
  const firebase = await loadFirebase();
  const key = `${JSON.stringify(schema)}|${preferCloud ? "cloud" : "auto"}`;
  if (modelCache.has(key)) return { ...firebase, ...modelCache.get(key) };

  const support = store.state.ai.deviceSupport;
  const deviceReady = support?.availability === "available" && !preferCloud;
  const mode = deviceReady
    ? firebase.sdk.InferenceMode.PREFER_ON_DEVICE
    : firebase.sdk.InferenceMode.PREFER_IN_CLOUD;

  const inCloudParams = {
    model: firebase.settings.cloudModel || DEFAULT_CLOUD_MODEL,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: schema,
      temperature: 0.25,
      // Gemini 3.x/4.x always think; LOW keeps plan interpretation responsive.
      // Faster models (Flash-Lite) treat this as a small, safe budget.
      thinkingConfig: { thinkingLevel: "LOW" },
    },
  };
  if (firebase.settings.cloudModel) inCloudParams.model = firebase.settings.cloudModel;

  const model = firebase.sdk.getGenerativeModel(firebase.ai, {
    mode,
    inCloudParams,
    onDeviceParams: {
      promptOptions: { responseConstraint: schema },
    },
  });
  const entry = { model, mode, deviceReady };
  modelCache.set(key, entry);
  return { ...firebase, ...entry };
}

/** Must be invoked synchronously from a user gesture before the first request. */
function prepareDeviceModel(model) {
  if (preparedModels.has(model)) return;
  preparedModels.add(model);
  try {
    store.setAI({ preparing: true, progress: null, lastError: "" });
    model.initializeDeviceModel?.((progress) => {
      if (typeof progress === "number" && Number.isFinite(progress)) {
        store.setAI({ preparing: true, progress: Math.max(0, Math.min(1, progress)) });
      }
    });
    // PREFER_ON_DEVICE falls back to cloud while a download continues, so do
    // not block the workspace on the model download.
    setTimeout(() => {
      store.setAI({ preparing: false, progress: null });
    }, 2400);
  } catch (error) {
    console.warn("[planwalk] device model init failed", error);
    store.setAI({ preparing: false, progress: null });
  }
}

function parseStructuredText(text) {
  if (!text || typeof text !== "string") throw new Error("The model returned an empty response.");
  let cleaned = text.trim();
  const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) cleaned = fence[1].trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        /* fall through */
      }
    }
    throw new Error("The model response was not valid JSON.");
  }
}

export class AIUnavailableError extends Error {
  constructor(message, userMessage) {
    super(message);
    this.name = "AIUnavailableError";
    this.userMessage = userMessage || message;
  }
}

/**
 * Single-turn hybrid request. Returns the parsed structured response and the
 * SDK-reported inferenceSource (ON_DEVICE or IN_CLOUD).
 */
export async function generateStructured({ prompt, image = null, schema, preferCloud = Boolean(image) }) {
  const { model, deviceReady } = await ensureModel(schema, { preferCloud });
  // Only initialize the device model when this request will prefer it.
  if (deviceReady) {
    prepareDeviceModel(model);
  }

  const parts = image
    ? [
        prompt,
        {
          inlineData: { data: image.data, mimeType: image.mimeType },
        },
      ]
    : prompt;

  let result;
  try {
    result = await model.generateContent(parts);
  } catch (error) {
    console.warn("[planwalk] AI request failed", error);
    store.setAI({ preparing: false, progress: null, lastError: error?.message || String(error) });
    throw new AIUnavailableError(
      error?.message || "AI request failed",
      humanizeAIError(error)
    );
  }

  const response = result?.response;
  const rawSource = response?.inferenceSource;
  const sourceKey = rawSource ? String(rawSource).toLowerCase() : "";
  const inferenceSource =
    sourceKey === "on_device"
      ? "ON_DEVICE"
      : sourceKey === "in_cloud"
        ? "IN_CLOUD"
        : sourceKey
          ? String(rawSource).toUpperCase()
          : null;
  const text = response?.text?.() || "";
  store.setAI({
    preparing: false,
    progress: null,
    lastSource: inferenceSource,
    lastError: "",
  });

  const data = parseStructuredText(text);
  return { data, inferenceSource, text };
}

export function humanizeAIError(error) {
  const message = String(error?.message || error || "");
  if (/app.?check/i.test(message)) {
    return "Firebase App Check blocked the request. For localhost, copy the debug token from AI settings into Firebase Console → App Check → Apps → Manage debug tokens, then reload. Production needs a real App Check provider.";
  }
  if (/api.?key|api_key_invalid|invalid api key|key not valid/i.test(message)) {
    return "The Firebase API key was rejected. Double-check the apiKey and projectId in AI settings.";
  }
  if (/firebase ai api|firebase ai logic api|api-not-enabled|api has not been used|enable this api/i.test(message)) {
    return "Firebase AI Logic isn't enabled for this project yet. Open Firebase Console → AI Services → AI Logic, click Get started, and enable the Firebase AI Logic API. Wait a minute, then reload and retry.";
  }
  if (/permission denied on the service|access_denied|service_disabled|api is not enabled/i.test(message)) {
    return "The AI service denied access. Finish AI Logic setup for this Firebase project, and if AI Logic is already enabled, register the App Check debug token shown in AI settings. Then reload and try again.";
  }
  if (/permission|unauthori[sz]ed|403|401/i.test(message)) {
    return "Firebase denied the AI request. Check that AI Logic is enabled and App Check is configured for this origin. If you're on localhost, make sure the App Check debug token is registered.";
  }
  if (/quota|rate limit|too many requests|429/i.test(message)) {
    return "The AI quota for this project is exhausted. Try again later, or use manual editing.";
  }
  if (/(model.*(?:not found|unavailable|unsupported|invalid|no longer available))|(?:(?:not found|unavailable|unsupported|no longer available).*model)/i.test(message)) {
    return "The requested cloud model isn't available to this project. Set a valid fallback model in AI settings — for example gemini-4-hydrogen — or clear the field to use the default.";
  }
  if (/network|offline|failed to fetch|fetch failed/i.test(message)) {
    return "The AI service couldn't be reached. Check your connection, or use manual editing.";
  }
  return "The AI request could not be completed. Manual editing still works — try again or use a rule-based prompt.";
}

export async function refreshAIStatus() {
  const settings = getFirebaseSettings();
  store.setAI({
    configured: Boolean(settings.config),
    config: settings.config,
    cloudModel: settings.cloudModel,
    configSource: settings.source,
  });
  const previous = store.state.ai.deviceSupport;
  const support = await getDeviceSupport();
  // A cached model keeps the inference mode it was created with. If the
  // on-device model finished downloading after the first request, rebuild the
  // model so it can switch from cloud fallback to local inference.
  const changed =
    !previous ||
    previous.supported !== support.supported ||
    previous.availability !== support.availability;
  if (changed) resetAI();
  store.setAI({ deviceSupport: support });
  return settings;
}

export function hasConsent(kind = "design") {
  return kind === "design" ? store.state.ai.consent : store.state.ai.planConsentSession;
}

export function grantConsent(kind = "design") {
  if (kind === "design") store.setAI({ consent: true });
  else store.setAI({ planConsentSession: true });
}

/** Explicit user-gesture warm-up from AI settings. */
export async function warmDeviceModel(schema) {
  const { model } = await ensureModel(schema);
  prepareDeviceModel(model);
}
