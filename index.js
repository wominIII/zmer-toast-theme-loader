(function () {
  'use strict';

  const PLUGIN_ID = 'zmer-universal-toast-theme';
  const STYLE_ID = `${PLUGIN_ID}-style`;
  const PANEL_ID = `${PLUGIN_ID}-settings`;
  const LAYER_ID = `${PLUGIN_ID}-layer`;
  const SEND_DOCK_ID = `${PLUGIN_ID}-send-dock-handle`;
  const SETTINGS_KEY = `${PLUGIN_ID}-settings-v1`;
  const EDGE_DOCK_KEY = `${PLUGIN_ID}-edge-dock-v1`;
  const COLOR_PRESET_KEY = `${PLUGIN_ID}-color-presets-v1`;
  const EDGE_DOCK_ID = `${PLUGIN_ID}-edge-dock`;
  const EDGE_DOCK_CAPTURE_ID = `${PLUGIN_ID}-edge-dock-capture`;
  const ACU_PATCH_FLAG = `${PLUGIN_ID}-acu-patch`;
  const EDGE_DOCK_LIVE_SIZE = 28;
  const GSAP_SCRIPT_ID = `${PLUGIN_ID}-gsap-script`;
  const GSAP_CDN_URL = 'https://gcore.jsdelivr.net/npm/gsap@3.12.7/dist/gsap.min.js';
  const COLOR_SETTING_KEYS = new Set([
    'infoColor',
    'successColor',
    'warningColor',
    'errorColor',
    'bgColor',
    'textColor',
    'checkboxTickColor',
  ]);
  const SOURCE_SELECTOR = [
    '#toast-container .toast',
    '#toast-container [role="alert"]',
    '#toast-container [role="status"]',
    '#toast-container > div',
    '.toast-container .toast',
    '.toast-container [role="alert"]',
    '.toast-container [role="status"]',
    '.toast-container > div',
    'body > .toast',
    'body > .toast-info',
    'body > .toast-success',
    'body > .toast-warning',
    'body > .toast-error',
    '.acu-toast',
  ].join(', ');
  const TOAST_CONTAINER_SELECTOR = '#toast-container, .toast-container';
  const FAST_TOAST_SELECTOR = '.toast, .acu-toast, [role="alert"], [role="status"], .toast-info, .toast-success, .toast-warning, .toast-error';
  const EDGE_DOCK_EXCLUDED_SELECTOR = [
    '#top-bar',
    '#top-settings-holder',
    '.top-settings-holder',
    '#rightNavHolder',
    '#leftNavHolder',
    '#send_form',
    '#form_sheld',
    '#nonQRFormItems',
    '#leftSendForm',
    '#rightSendForm',
    '#options_button',
    '#extensionsMenuButton',
    '#send_but',
    '#mes_stop',
    '#stscript_continue',
    '#stscript_pause',
    '#stscript_stop',
  ].join(', ');
  const MUTATION_BURST_RECORD_LIMIT = 60;
  const MUTATION_BURST_NODE_LIMIT = 120;
  const SAFE_MODE_DURATION = 2400;
  const TOAST_BURST_WINDOW = 1200;
  const TOAST_BURST_LIMIT = 10;
  const STARTUP_DEBUG_WINDOW = 10000;

  const DEFAULT_SETTINGS = {
    enabled: true,
    popupSkin: true,
    abortGuard: true,
    keepAlive: false,
    inputDock: false,
    immersiveMode: false,
    edgeDockEnabled: false,
    edgeDockDropCapture: true,
    edgeDockPosition: 'right',
    edgeDockEdgeOffset: 8,
    edgeDockShiftX: 0,
    edgeDockShiftY: 0,
    topOffset: 40,
    offsetX: 0,
    offsetY: 0,
    scale: 1,
    maxWidth: 520,
    titleWidth: 120,
    maxStack: 3,
    duration: 2600,
    errorDuration: 4200,
    maxTextLength: 800,
    loadingFx: 'off',
    centerDebug: true,
    infoColor: '#77b7ff',
    successColor: '#6ee7a8',
    warningColor: '#ffd166',
    errorColor: '#ff6b7a',
    bgColor: '#101419',
    textColor: '#eef6ff',
    checkboxTickColor: '#ffffff',
  };

  function getHostWindow() {
    try {
      if (window.parent && window.parent !== window && window.parent.document) {
        return window.parent;
      }
    } catch (_) {
      // Tavern Helper normally runs same-origin, but fallback cleanly.
    }
    return window;
  }

  const hostWindow = getHostWindow();
  const hostDocument = hostWindow.document || document;
  const previousUniversalCleanup = hostWindow.__zmerUniversalToastThemeCleanup || window.__zmerUniversalToastThemeCleanup;
  const previousLegacyCleanup = hostWindow.__zmerShujukuToastThemeCleanup || window.__zmerShujukuToastThemeCleanup;

  [previousUniversalCleanup, previousLegacyCleanup].forEach((cleanup) => {
    if (typeof cleanup !== 'function') {
      return;
    }
    try {
      cleanup();
    } catch (error) {
      console.warn('[酒馆提示框美化] previous cleanup failed', error);
    }
  });

  const observedDocuments = Array.from(new Set([hostDocument, document].filter(Boolean)));
  const state = {
    settings: null,
    colorPresets: [],
    activeColorPresetId: '',
    layer: null,
    observers: [],
    active: [],
    seen: new WeakSet(),
    sourceMap: new WeakMap(),
    hiddenSources: new Set(),
    suppressWorkflowToastsUntil: 0,
    resizeHandler: null,
    abortHandler: null,
    acuCooldownTimer: null,
    acuCooldownUntil: 0,
    patchedApi: null,
    settingsSaveTimer: null,
    settingsRetryTimer: null,
    toastContainerScanTimer: null,
    safeModeUntil: 0,
    safeNoticeAt: 0,
    toastBurstStartedAt: 0,
    toastBurstCount: 0,
    sendDockHandle: null,
    sendDockCleanup: null,
    sendDockObserver: null,
    sendDockCollapseTimer: null,
    sendDockRetryTimer: null,
    inputDockExpanded: false,
    fullscreenChangeHandler: null,
    dockRoot: null,
    dockHandle: null,
    dockPanel: null,
    dockList: null,
    dockPresetPanel: null,
    dockCaptureActive: false,
    dockOpen: false,
    dockItems: [],
    dockElementMap: new Map(),
    dockElementObserverMap: new Map(),
    dockElementAnchorFrameMap: new Map(),
    dockHiddenMap: new WeakMap(),
    dockSizeMap: new WeakMap(),
    dockMutationObserver: null,
    dockSyncTimer: null,
    dockCaptureCleanup: null,
    dockCaptureSourceElement: null,
    dockDragSession: null,
    dockLaunchSession: null,
    dockLaunchTimer: null,
    dockAdjustSession: null,
    dockAdjustCleanup: null,
    dockOutsideCleanup: null,
    dockViewportHandler: null,
    dockSuppressToggleUntil: 0,
    ciIslandDocked: false,
    ciIslandCollapsed: false,
    ciIslandEdge: 'right',
    ciIslandTop: 150,
    ciIslandDragSession: null,
    ciIslandCleanup: null,
    ciIslandObserver: null,
    gsapLoadPromise: null,
    gsapEnabled: false,
    startedAt: Date.now(),
    keepAliveTimer: null,
    keepAliveWakeLock: null,
    keepAliveWakeLockPending: false,
    keepAliveVisibilityHandler: null,
    keepAliveFocusHandler: null,
    keepAlivePageShowHandler: null,
    keepAlivePageHideHandler: null,
    keepAliveHiddenAt: 0,
    keepAliveLastRecoveryAt: 0,
  };

  function clamp(value, min, max, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return fallback;
    }
    return Math.min(max, Math.max(min, number));
  }

  function normalizeColor(value, fallback) {
    const text = String(value || '').trim();
    return /^#[0-9a-f]{6}$/i.test(text) ? text : fallback;
  }

  function getAutoCheckboxTickColor(backgroundHex) {
    const color = normalizeColor(backgroundHex, DEFAULT_SETTINGS.bgColor).slice(1);
    const red = Number.parseInt(color.slice(0, 2), 16) / 255;
    const green = Number.parseInt(color.slice(2, 4), 16) / 255;
    const blue = Number.parseInt(color.slice(4, 6), 16) / 255;
    const luminance = (0.2126 * red) + (0.7152 * green) + (0.0722 * blue);
    return luminance > 0.48 ? '#101419' : '#ffffff';
  }

  function hexToRgbTriplet(hex) {
    const color = normalizeColor(hex, '#000000').slice(1);
    return [
      Number.parseInt(color.slice(0, 2), 16),
      Number.parseInt(color.slice(2, 4), 16),
      Number.parseInt(color.slice(4, 6), 16),
    ].join(' ');
  }

  function normalizeSettings(input = {}) {
    const backgroundColor = normalizeColor(input.bgColor, DEFAULT_SETTINGS.bgColor);
    return {
      enabled: input.enabled !== false,
      popupSkin: input.popupSkin !== false,
      abortGuard: input.abortGuard !== false,
      keepAlive: input.keepAlive === true,
      inputDock: input.inputDock === true,
      immersiveMode: input.immersiveMode === true,
      edgeDockEnabled: input.edgeDockEnabled === true,
      edgeDockDropCapture: input.edgeDockDropCapture !== false,
      edgeDockPosition: ['left', 'right', 'top', 'bottom'].includes(input.edgeDockPosition) ? input.edgeDockPosition : DEFAULT_SETTINGS.edgeDockPosition,
      edgeDockEdgeOffset: clamp(input.edgeDockEdgeOffset, -80, 120, DEFAULT_SETTINGS.edgeDockEdgeOffset),
      edgeDockShiftX: clamp(input.edgeDockShiftX, -520, 520, DEFAULT_SETTINGS.edgeDockShiftX),
      edgeDockShiftY: clamp(input.edgeDockShiftY, -520, 520, DEFAULT_SETTINGS.edgeDockShiftY),
      topOffset: clamp(input.topOffset, 0, 180, DEFAULT_SETTINGS.topOffset),
      offsetX: clamp(input.offsetX, -520, 520, DEFAULT_SETTINGS.offsetX),
      offsetY: clamp(input.offsetY, -260, 260, DEFAULT_SETTINGS.offsetY),
      scale: clamp(input.scale, 0.72, 1.8, DEFAULT_SETTINGS.scale),
      maxWidth: clamp(input.maxWidth, 260, 980, DEFAULT_SETTINGS.maxWidth),
      titleWidth: clamp(input.titleWidth, 60, 260, DEFAULT_SETTINGS.titleWidth),
      maxStack: Math.round(clamp(input.maxStack, 1, 8, DEFAULT_SETTINGS.maxStack)),
      duration: Math.round(clamp(input.duration, 900, 12000, DEFAULT_SETTINGS.duration)),
      errorDuration: Math.round(clamp(input.errorDuration, 1200, 18000, DEFAULT_SETTINGS.errorDuration)),
      maxTextLength: DEFAULT_SETTINGS.maxTextLength,
      loadingFx: input.loadingFx === 'starwarp' ? input.loadingFx : DEFAULT_SETTINGS.loadingFx,
      centerDebug: input.centerDebug === true,
      infoColor: normalizeColor(input.infoColor, DEFAULT_SETTINGS.infoColor),
      successColor: normalizeColor(input.successColor, DEFAULT_SETTINGS.successColor),
      warningColor: normalizeColor(input.warningColor, DEFAULT_SETTINGS.warningColor),
      errorColor: normalizeColor(input.errorColor, DEFAULT_SETTINGS.errorColor),
      bgColor: backgroundColor,
      textColor: normalizeColor(input.textColor, DEFAULT_SETTINGS.textColor),
      checkboxTickColor: normalizeColor(input.checkboxTickColor, getAutoCheckboxTickColor(backgroundColor)),
    };
  }

  function loadSettings() {
    try {
      return normalizeSettings(JSON.parse(hostWindow.localStorage?.getItem(SETTINGS_KEY) || '{}'));
    } catch (_) {
      return normalizeSettings();
    }
  }

  function saveSettings() {
    hostWindow.clearTimeout(state.settingsSaveTimer);
    state.settingsSaveTimer = null;
    try {
      hostWindow.localStorage?.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
    } catch (_) {
      // Ignore storage errors; runtime settings still apply.
    }
  }

  function scheduleSaveSettings() {
    hostWindow.clearTimeout(state.settingsSaveTimer);
    state.settingsSaveTimer = hostWindow.setTimeout(() => {
      state.settingsSaveTimer = null;
      saveSettings();
    }, 180);
  }

  function normalizeDockItems(input = []) {
    if (!Array.isArray(input)) {
      return [];
    }
    return input
      .map((item) => {
        const fingerprint = item && typeof item === 'object' ? item.fingerprint || {} : {};
        const normalized = {
          id: cleanText(item?.id || ''),
          name: cleanText(item?.name || ''),
          iconClass: cleanText(item?.iconClass || ''),
          fingerprint: {
            scriptId: cleanText(fingerprint.scriptId || '') || null,
            elementId: cleanText(fingerprint.elementId || '') || null,
            classSelector: cleanText(fingerprint.classSelector || '') || null,
            title: cleanText(fingerprint.title || '') || null,
          },
        };
        if (!normalized.id) {
          normalized.id = `dock-${Math.abs(hashText(JSON.stringify(normalized.fingerprint) || normalized.name || String(Math.random()))).toString(36)}`;
        }
        return normalized;
      })
      .filter((item) => item.fingerprint.scriptId || item.fingerprint.elementId || item.fingerprint.classSelector || item.fingerprint.title);
  }

  function loadDockItems() {
    try {
      return normalizeDockItems(JSON.parse(hostWindow.localStorage?.getItem(EDGE_DOCK_KEY) || '[]'));
    } catch (_) {
      return [];
    }
  }

  function saveDockItems() {
    try {
      hostWindow.localStorage?.setItem(EDGE_DOCK_KEY, JSON.stringify(normalizeDockItems(state.dockItems)));
    } catch (_) {
      // Ignore storage errors; runtime state still applies.
    }
  }

  function getCurrentColors(settings = state.settings || DEFAULT_SETTINGS) {
    const colors = {};
    COLOR_SETTING_KEYS.forEach((key) => {
      colors[key] = normalizeColor(settings[key], DEFAULT_SETTINGS[key]);
    });
    return colors;
  }

  function colorsMatch(a, b) {
    if (!a || !b) {
      return false;
    }
    for (const key of COLOR_SETTING_KEYS) {
      const left = normalizeColor(a[key], DEFAULT_SETTINGS[key]).toLowerCase();
      const right = normalizeColor(b[key], DEFAULT_SETTINGS[key]).toLowerCase();
      if (left !== right) {
        return false;
      }
    }
    return true;
  }

  function normalizeColorPresets(input = []) {
    if (!Array.isArray(input)) {
      return [];
    }
    return input
      .map((item) => {
        if (!item || typeof item !== 'object') {
          return null;
        }
        const source = item.colors && typeof item.colors === 'object' ? item.colors : {};
        const colors = {};
        COLOR_SETTING_KEYS.forEach((key) => {
          colors[key] = normalizeColor(source[key], DEFAULT_SETTINGS[key]);
        });
        const preset = {
          id: cleanText(item.id || ''),
          name: cleanText(item.name || '') || '未命名',
          colors,
        };
        if (!preset.id) {
          preset.id = `preset-${Math.abs(hashText(preset.name + JSON.stringify(colors) + Math.random())).toString(36)}`;
        }
        return preset;
      })
      .filter(Boolean);
  }

  function loadColorPresets() {
    try {
      return normalizeColorPresets(JSON.parse(hostWindow.localStorage?.getItem(COLOR_PRESET_KEY) || '[]'));
    } catch (_) {
      return [];
    }
  }

  function saveColorPresets() {
    try {
      hostWindow.localStorage?.setItem(COLOR_PRESET_KEY, JSON.stringify(normalizeColorPresets(state.colorPresets)));
    } catch (_) {
      // Ignore storage errors; runtime presets still apply.
    }
  }

  function findColorPreset(id) {
    const target = cleanText(id);
    return state.colorPresets.find((preset) => preset.id === target) || null;
  }

  function getActiveColorPresetId() {
    const current = getCurrentColors();
    if (state.activeColorPresetId) {
      const tracked = findColorPreset(state.activeColorPresetId);
      if (tracked && colorsMatch(tracked.colors, current)) {
        return tracked.id;
      }
    }
    const match = state.colorPresets.find((preset) => colorsMatch(preset.colors, current));
    return match ? match.id : '';
  }

  function addColorPreset(name) {
    const presetName = cleanText(name) || `预设 ${state.colorPresets.length + 1}`;
    const preset = {
      id: `preset-${Math.abs(hashText(presetName + Date.now() + Math.random())).toString(36)}`,
      name: presetName,
      colors: getCurrentColors(),
    };
    state.colorPresets.push(preset);
    state.colorPresets = normalizeColorPresets(state.colorPresets);
    saveColorPresets();
    refreshColorPresetViews();
    return preset;
  }

  function applyColorPreset(id) {
    const preset = findColorPreset(id);
    if (!preset || !state.settings) {
      return;
    }
    state.activeColorPresetId = preset.id;
    COLOR_SETTING_KEYS.forEach((key) => {
      state.settings[key] = preset.colors[key];
    });
    state.settings = normalizeSettings(state.settings);
    applySettings();
    saveSettings();
    syncSettingsPanel();
    refreshColorPresetViews();
  }

  function removeColorPreset(id) {
    const target = cleanText(id);
    state.colorPresets = state.colorPresets.filter((preset) => preset.id !== target);
    if (state.activeColorPresetId === target) {
      state.activeColorPresetId = '';
    }
    saveColorPresets();
    refreshColorPresetViews();
  }

  function refreshColorPresetViews() {
    renderColorPresetList(hostDocument.getElementById(PANEL_ID));
    renderDockPresetSwitcher();
  }

  function cleanText(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
  }

  function hashText(text) {
    let hash = 0;
    const source = String(text || '');
    for (let index = 0; index < source.length; index += 1) {
      hash = ((hash << 5) - hash) + source.charCodeAt(index);
      hash |= 0;
    }
    return hash;
  }

  function applySettings() {
    const root = hostDocument.documentElement;
    const settings = state.settings || DEFAULT_SETTINGS;
    const scale = clamp(settings.scale, 0.72, 1.8, DEFAULT_SETTINGS.scale);

    root.classList.toggle(`${PLUGIN_ID}-popup-on`, !!settings.popupSkin);
    applyThemeVariables(root, settings);
    root.style.setProperty('--zut-chip-max-width', `${Math.round(settings.maxWidth * scale)}px`);
    root.style.setProperty('--zut-title-max-width', `${Math.round(settings.titleWidth * scale)}px`);
    root.style.setProperty('--zut-chip-padding-y', `${(5 * scale).toFixed(2)}px`);
    root.style.setProperty('--zut-chip-padding-x', `${(9 * scale).toFixed(2)}px`);
    root.style.setProperty('--zut-chip-gap', `${(7 * scale).toFixed(2)}px`);
    root.style.setProperty('--zut-chip-radius', `${(7 * scale).toFixed(2)}px`);
    root.style.setProperty('--zut-chip-font-size', `${(11 * scale).toFixed(2)}px`);
    root.style.setProperty('--zut-button-pad-y', `${(2 * scale).toFixed(2)}px`);
    root.style.setProperty('--zut-button-pad-x', `${(7 * scale).toFixed(2)}px`);
    root.style.setProperty('--zut-dot-size', `${Math.max(5, Math.round(6 * scale))}px`);
    syncImmersiveMode(false);
    refreshActiveLoadingFx();
    syncInputDockMode();
    syncEdgeDockMode();
    syncKeepAliveMode();
    layoutChips();
  }

  function applyThemeVariables(root = hostDocument.documentElement, settings = state.settings || DEFAULT_SETTINGS) {
    root.style.setProperty('--zut-info-accent', settings.infoColor);
    root.style.setProperty('--zut-success-accent', settings.successColor);
    root.style.setProperty('--zut-warning-accent', settings.warningColor);
    root.style.setProperty('--zut-error-accent', settings.errorColor);
    root.style.setProperty('--zut-bg-rgb', hexToRgbTriplet(settings.bgColor));
    root.style.setProperty('--zut-text-color', settings.textColor);
    root.style.setProperty('--zut-checkbox-tick-color', settings.checkboxTickColor);
  }

  function getGsap() {
    return hostWindow.gsap || window.gsap || null;
  }

  function isGsapToastMode() {
    return !!(state.gsapEnabled && getGsap() && hostDocument.documentElement.classList.contains(`${PLUGIN_ID}-gsap-toast-on`));
  }

  function ensureGsap() {
    if (getGsap()) {
      state.gsapEnabled = true;
      hostDocument.documentElement.classList.add(`${PLUGIN_ID}-gsap-toast-on`);
      return Promise.resolve(getGsap());
    }
    if (state.gsapLoadPromise) {
      return state.gsapLoadPromise;
    }

    state.gsapLoadPromise = new Promise((resolve, reject) => {
      let script = hostDocument.getElementById(GSAP_SCRIPT_ID);
      const finishResolve = () => {
        const gsap = getGsap();
        if (!gsap) {
          reject(new Error('GSAP loaded without global object'));
          return;
        }
        state.gsapEnabled = true;
        hostDocument.documentElement.classList.add(`${PLUGIN_ID}-gsap-toast-on`);
        resolve(gsap);
      };

      if (script) {
        script.addEventListener('load', finishResolve, { once: true });
        script.addEventListener('error', () => reject(new Error('GSAP load failed')), { once: true });
        return;
      }

      script = hostDocument.createElement('script');
      script.id = GSAP_SCRIPT_ID;
      script.src = GSAP_CDN_URL;
      script.async = true;
      script.onload = finishResolve;
      script.onerror = () => reject(new Error('GSAP load failed'));
      (hostDocument.head || hostDocument.documentElement).appendChild(script);
    }).catch((error) => {
      console.warn('[酒馆提示框美化] GSAP unavailable, fallback to CSS animation', error);
      state.gsapEnabled = false;
      hostDocument.documentElement.classList.remove(`${PLUGIN_ID}-gsap-toast-on`);
      return null;
    });

    return state.gsapLoadPromise;
  }

  function getFullscreenElement() {
    return hostDocument.fullscreenElement
      || hostDocument.webkitFullscreenElement
      || hostDocument.msFullscreenElement
      || null;
  }

  function isFullscreenActive() {
    return !!getFullscreenElement();
  }

  async function requestBrowserFullscreen() {
    const target = hostDocument.documentElement;
    if (!target) {
      return false;
    }

    try {
      if (typeof target.requestFullscreen === 'function') {
        try {
          await target.requestFullscreen({ navigationUI: 'hide' });
        } catch (_) {
          await target.requestFullscreen();
        }
        return true;
      }
      if (typeof target.webkitRequestFullscreen === 'function') {
        target.webkitRequestFullscreen();
        return true;
      }
      if (typeof target.msRequestFullscreen === 'function') {
        target.msRequestFullscreen();
        return true;
      }
    } catch (error) {
      console.warn('[酒馆提示框美化] fullscreen request failed, using immersive layout fallback', error);
    }
    return false;
  }

  async function exitBrowserFullscreen() {
    if (!isFullscreenActive()) {
      return;
    }
    try {
      if (typeof hostDocument.exitFullscreen === 'function') {
        await hostDocument.exitFullscreen();
      } else if (typeof hostDocument.webkitExitFullscreen === 'function') {
        hostDocument.webkitExitFullscreen();
      } else if (typeof hostDocument.msExitFullscreen === 'function') {
        hostDocument.msExitFullscreen();
      }
    } catch (_) {
      // Some mobile browsers reject exitFullscreen outside their own UI flow.
    }
  }

  function ensureFullscreenWatcher() {
    if (state.fullscreenChangeHandler) {
      return;
    }
    state.fullscreenChangeHandler = () => {
      hostDocument.documentElement.classList.toggle(`${PLUGIN_ID}-immersive-on`, !!state.settings?.immersiveMode);
      syncCiIslandDockState();
      if (state.settings?.edgeDockEnabled) {
        renderEdgeDock();
        hostWindow.requestAnimationFrame(() => {
          renderEdgeDock();
          scheduleDockSync(0);
        });
        hostWindow.setTimeout(() => {
          renderEdgeDock();
          scheduleDockSync(0);
        }, 180);
      }
    };
    hostDocument.addEventListener('fullscreenchange', state.fullscreenChangeHandler);
    hostDocument.addEventListener('webkitfullscreenchange', state.fullscreenChangeHandler);
    hostDocument.addEventListener('MSFullscreenChange', state.fullscreenChangeHandler);
  }

  function cleanupImmersiveMode() {
    hostDocument.documentElement.classList.remove(`${PLUGIN_ID}-immersive-on`);
    if (state.fullscreenChangeHandler) {
      hostDocument.removeEventListener('fullscreenchange', state.fullscreenChangeHandler);
      hostDocument.removeEventListener('webkitfullscreenchange', state.fullscreenChangeHandler);
      hostDocument.removeEventListener('MSFullscreenChange', state.fullscreenChangeHandler);
      state.fullscreenChangeHandler = null;
    }
  }

  function syncImmersiveMode(requestFullscreen = false) {
    const enabled = !!state.settings?.immersiveMode;
    hostDocument.documentElement.classList.toggle(`${PLUGIN_ID}-immersive-on`, enabled);
    if (!enabled) {
      exitBrowserFullscreen();
      return;
    }
    ensureFullscreenWatcher();
    if (requestFullscreen && !isFullscreenActive()) {
      requestBrowserFullscreen();
    }
  }

  function isProbablyMobileBrowser() {
    const nav = hostWindow.navigator || navigator;
    const width = hostWindow.innerWidth || hostDocument.documentElement?.clientWidth || 0;
    const touchPoints = Number(nav?.maxTouchPoints || 0);
    const userAgent = String(nav?.userAgent || '');
    return /android|iphone|ipad|ipod|mobile/i.test(userAgent) || (touchPoints > 1 && width < 1100);
  }

  function releaseKeepAliveWakeLock() {
    const lock = state.keepAliveWakeLock;
    state.keepAliveWakeLock = null;
    state.keepAliveWakeLockPending = false;
    if (!lock) {
      return;
    }
    Promise.resolve(lock.release?.()).catch(() => {});
  }

  async function requestKeepAliveWakeLock() {
    if (!state.settings?.keepAlive || !isProbablyMobileBrowser()) {
      releaseKeepAliveWakeLock();
      return false;
    }
    if (hostDocument.visibilityState === 'hidden' || state.keepAliveWakeLock || state.keepAliveWakeLockPending) {
      return !!state.keepAliveWakeLock;
    }
    const wakeLockApi = hostWindow.navigator?.wakeLock;
    if (!wakeLockApi?.request) {
      return false;
    }
    state.keepAliveWakeLockPending = true;
    try {
      const lock = await wakeLockApi.request('screen');
      if (state.keepAliveWakeLock && state.keepAliveWakeLock !== lock) {
        Promise.resolve(lock.release?.()).catch(() => {});
        return true;
      }
      state.keepAliveWakeLock = lock;
      lock.addEventListener?.('release', () => {
        if (state.keepAliveWakeLock === lock) {
          state.keepAliveWakeLock = null;
        }
        if (state.settings?.keepAlive && hostDocument.visibilityState === 'visible') {
          requestKeepAliveWakeLock();
        }
      }, { once: true });
      return true;
    } catch (_) {
      return false;
    } finally {
      state.keepAliveWakeLockPending = false;
    }
  }

  function recoverFromBackground(reason = 'resume') {
    const now = Date.now();
    if (now - Number(state.keepAliveLastRecoveryAt || 0) < 900) {
      return;
    }
    state.keepAliveLastRecoveryAt = now;
    ensureLayer();
    scanExisting();
    scheduleToastContainerScan();
    ensureSettingsPanel();
    patchAcuApi();
    if (state.settings?.edgeDockEnabled) {
      renderEdgeDock();
      hostWindow.requestAnimationFrame(() => {
        applyEdgeDockPosition();
        alignDockElements();
      });
      scheduleDockSync(0);
    }
    if (state.settings?.inputDock) {
      syncInputDockMode();
    }
    state.resizeHandler?.();
    const hiddenFor = state.keepAliveHiddenAt ? (now - state.keepAliveHiddenAt) : 0;
    if (hiddenFor > 20000 && state.settings?.enabled) {
      showChip({
        type: 'info',
        title: '已恢复',
        message: reason === 'pageshow' ? '页面已重新接回前台。' : '已尝试恢复前台状态。',
        actionButton: null,
        actionText: '',
      });
    }
    state.keepAliveHiddenAt = 0;
  }

  function clearKeepAliveLoop() {
    hostWindow.clearInterval(state.keepAliveTimer);
    state.keepAliveTimer = null;
  }

  function cleanupKeepAliveMode() {
    clearKeepAliveLoop();
    releaseKeepAliveWakeLock();
    if (state.keepAliveVisibilityHandler) {
      hostDocument.removeEventListener('visibilitychange', state.keepAliveVisibilityHandler, true);
      state.keepAliveVisibilityHandler = null;
    }
    if (state.keepAliveFocusHandler) {
      hostWindow.removeEventListener('focus', state.keepAliveFocusHandler, true);
      state.keepAliveFocusHandler = null;
    }
    if (state.keepAlivePageShowHandler) {
      hostWindow.removeEventListener('pageshow', state.keepAlivePageShowHandler, true);
      state.keepAlivePageShowHandler = null;
    }
    if (state.keepAlivePageHideHandler) {
      hostWindow.removeEventListener('pagehide', state.keepAlivePageHideHandler, true);
      state.keepAlivePageHideHandler = null;
    }
    state.keepAliveHiddenAt = 0;
    state.keepAliveLastRecoveryAt = 0;
  }

  function syncKeepAliveMode() {
    if (!state.settings?.keepAlive || !isProbablyMobileBrowser()) {
      cleanupKeepAliveMode();
      return;
    }

    if (!state.keepAliveVisibilityHandler) {
      state.keepAliveVisibilityHandler = () => {
        if (hostDocument.visibilityState === 'hidden') {
          state.keepAliveHiddenAt = Date.now();
          releaseKeepAliveWakeLock();
          return;
        }
        requestKeepAliveWakeLock();
        hostWindow.setTimeout(() => recoverFromBackground('visibility'), 120);
        hostWindow.setTimeout(() => recoverFromBackground('visibility-late'), 520);
      };
      hostDocument.addEventListener('visibilitychange', state.keepAliveVisibilityHandler, true);
    }

    if (!state.keepAliveFocusHandler) {
      state.keepAliveFocusHandler = () => {
        requestKeepAliveWakeLock();
        hostWindow.setTimeout(() => recoverFromBackground('focus'), 90);
      };
      hostWindow.addEventListener('focus', state.keepAliveFocusHandler, true);
    }

    if (!state.keepAlivePageShowHandler) {
      state.keepAlivePageShowHandler = () => {
        requestKeepAliveWakeLock();
        hostWindow.setTimeout(() => recoverFromBackground('pageshow'), 120);
      };
      hostWindow.addEventListener('pageshow', state.keepAlivePageShowHandler, true);
    }

    if (!state.keepAlivePageHideHandler) {
      state.keepAlivePageHideHandler = () => {
        state.keepAliveHiddenAt = Date.now();
        releaseKeepAliveWakeLock();
      };
      hostWindow.addEventListener('pagehide', state.keepAlivePageHideHandler, true);
    }

    requestKeepAliveWakeLock();
    if (!state.keepAliveTimer) {
      state.keepAliveTimer = hostWindow.setInterval(() => {
        if (!state.settings?.keepAlive || hostDocument.visibilityState === 'hidden') {
          return;
        }
        requestKeepAliveWakeLock();
        patchAcuApi();
        if (state.settings?.edgeDockEnabled) {
          scheduleDockSync(0);
        }
      }, 25000);
    }
  }

  function cssEscape(value) {
    const source = String(value || '');
    if (hostWindow.CSS?.escape) {
      return hostWindow.CSS.escape(source);
    }
    return source.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  }

  function getDockClassSelector(element) {
    const tokens = String(element?.className || '')
      .split(/\s+/)
      .map((token) => token.trim())
      .filter(Boolean)
      .filter((token) => !/^(active|open|opened|selected|hover|focus|dragging|sortable-chosen|ui-)/i.test(token))
      .slice(0, 4);
    return tokens.length ? tokens.map((token) => `.${cssEscape(token)}`).join('') : null;
  }

  function buildDockFingerprint(element) {
    return {
      scriptId: cleanText(element?.getAttribute?.('script_id') || element?.closest?.('[script_id]')?.getAttribute?.('script_id') || '') || null,
      elementId: cleanText(element?.id || '') || null,
      classSelector: getDockClassSelector(element),
      title: cleanText(element?.getAttribute?.('title') || element?.getAttribute?.('aria-label') || '') || null,
    };
  }

  function isCompatibleIslandElement(element) {
    return !!(element && element.nodeType === 1 && (
      element.id === 'ci-island-container'
      || element.closest?.('#ci-island-container')
    ));
  }

  function isEdgeDockExcludedElement(element) {
    if (!element || element.nodeType !== 1) {
      return true;
    }
    if (isCompatibleIslandElement(element)) {
      return false;
    }
    return !!element.closest?.(EDGE_DOCK_EXCLUDED_SELECTOR);
  }

  function isValidDockFingerprint(fingerprint) {
    return !!(fingerprint?.scriptId || fingerprint?.elementId || fingerprint?.classSelector || fingerprint?.title);
  }

  function dockFingerprintsMatch(left, right) {
    if (!left || !right) {
      return false;
    }
    if (left.scriptId && right.scriptId) {
      return left.scriptId === right.scriptId;
    }
    if (left.elementId && right.elementId) {
      return left.elementId === right.elementId;
    }
    if (left.classSelector && right.classSelector) {
      if (left.title && right.title) {
        return left.classSelector === right.classSelector && left.title === right.title;
      }
      return left.classSelector === right.classSelector;
    }
    return !!(left.title && right.title && left.title === right.title);
  }

  function extractDockIconClass(element) {
    if (element?.id === 'ci-island-container') {
      return 'fa-solid fa-layer-group';
    }
    const iconNode = element?.querySelector?.('i[class*="fa-"], .fa-solid, .fa-regular, .fa-brands') || element;
    const className = String(iconNode?.className || '');
    const tokens = className
      .split(/\s+/)
      .filter((token) => /^fa[srb]?$/.test(token) || /^fa-[\w-]+$/.test(token) || /^(fa-solid|fa-regular|fa-brands)$/.test(token));
    return tokens.length ? tokens.join(' ') : '';
  }

  function extractDockName(element) {
    if (element?.id === 'ci-island-container') {
      return '浮岛';
    }
    const raw = cleanText(
      element?.getAttribute?.('title')
      || element?.getAttribute?.('aria-label')
      || element?.getAttribute?.('data-original-title')
      || element?.textContent
      || element?.id
      || element?.getAttribute?.('script_id')
      || '',
    );
    return raw ? raw.slice(0, 36) : '收纳按钮';
  }

  function hasDockableIdentity(element) {
    if (!element?.matches) {
      return false;
    }
    if (element.id === 'ci-island-container') {
      return true;
    }
    if (element.matches('button, [role="button"], .menu_button, .interactable, [script_id], .ui-draggable')) {
      return true;
    }
    const style = hostWindow.getComputedStyle?.(element);
    const positioned = /fixed|absolute|sticky/.test(style?.position || '');
    const hint = /ball|floating|fab|button|menu|tool|quick|reply|wand|script|extension/i.test(`${element.className || ''} ${element.id || ''}`);
    const namedFloatingWidget = !!(element.id || cleanClassList(element).length);
    return positioned && (hint || style?.pointerEvents !== 'none' || namedFloatingWidget);
  }

  function isDockableElement(element, loose = false) {
    if (!element || element.nodeType !== 1) {
      return false;
    }
    if (element === hostDocument.body || element === hostDocument.documentElement) {
      return false;
    }
    if (element.closest?.(`#${EDGE_DOCK_ID}, #${EDGE_DOCK_CAPTURE_ID}, #${PANEL_ID}, #${LAYER_ID}`)) {
      return false;
    }
    if (isEdgeDockExcludedElement(element)) {
      return false;
    }
    const style = hostWindow.getComputedStyle?.(element);
    if (!style || style.display === 'none' || style.visibility === 'hidden') {
      return false;
    }
    const rect = element.getBoundingClientRect();
    const width = rect.width || element.offsetWidth || 0;
    const height = rect.height || element.offsetHeight || 0;
    if (element.id === 'ci-island-container') {
      return width >= 24
        && width <= 160
        && height >= 24
        && height <= 420
        && /fixed|absolute|sticky/.test(style.position || '');
    }
    if (width < 14 || height < 14 || width > 240 || height > 240) {
      return false;
    }
    const area = width * height;
    if (!hasDockableIdentity(element)) {
      return false;
    }
    return area < (loose ? 24000 : 18000);
  }

  function scoreDockCandidate(element) {
    const style = hostWindow.getComputedStyle?.(element);
    const rect = element.getBoundingClientRect();
    let score = 0;
    if (element.id === 'ci-island-container') {
      score += 220;
    }
    if (element.matches?.('button, [role="button"], .menu_button, .interactable')) {
      score += 90;
    }
    if (element.getAttribute?.('script_id') || element.closest?.('[script_id]')) {
      score += 35;
    }
    if (/fixed/.test(style?.position || '')) {
      score += 40;
    } else if (/absolute|sticky/.test(style?.position || '')) {
      score += 18;
    }
    if (/ball|floating|fab|button|menu|tool|quick|reply|wand|script|extension/i.test(`${element.className || ''} ${element.id || ''}`)) {
      score += 28;
    }
    if (rect.width * rect.height >= 320 && rect.width * rect.height <= 6400) {
      score += 22;
    }
    score -= Math.round((rect.width * rect.height) / 1800);
    return score;
  }

  function resolveDockableElement(node) {
    const compatibleIsland = node?.closest?.('#ci-island-container');
    if (compatibleIsland && isDockableElement(compatibleIsland, true)) {
      return compatibleIsland;
    }
    const candidates = [];
    const seen = new Set();
    let current = node;
    let depth = 0;
    while (current && current !== hostDocument.body && depth < 7) {
      if (!seen.has(current)) {
        seen.add(current);
        if (isDockableElement(current, true)) {
          candidates.push(current);
        }
      }
      current = current.parentElement;
      depth += 1;
    }
    candidates.sort((left, right) => scoreDockCandidate(right) - scoreDockCandidate(left));
    return candidates[0] || null;
  }

  function findDockCaptureTarget(clientX, clientY) {
    const hits = hostDocument.elementsFromPoint?.(clientX, clientY) || [];
    const seen = new Set();
    const candidates = [];
    hits.forEach((hit) => {
      const candidate = resolveDockableElement(hit);
      if (candidate && !seen.has(candidate)) {
        seen.add(candidate);
        candidates.push(candidate);
      }
    });
    candidates.sort((left, right) => scoreDockCandidate(right) - scoreDockCandidate(left));
    return candidates[0] || null;
  }

  function findDockActionTarget(element) {
    return element?.matches?.('button, [role="button"], .menu_button, .interactable')
      ? element
      : element?.querySelector?.('button, [role="button"], .menu_button, .interactable') || element;
  }

  function prepareDockElement(element) {
    if (!element || state.dockHiddenMap.has(element)) {
      return;
    }
    const rect = element.getBoundingClientRect?.() || null;
    const width = Math.max(18, element.offsetWidth || rect?.width || 34);
    const height = Math.max(18, element.offsetHeight || rect?.height || 34);
    state.dockHiddenMap.set(element, element.getAttribute('style') || '');
    state.dockSizeMap.set(element, { width, height });
  }

  function anchorDockElement(element, slotRect) {
    if (!element || !slotRect) {
      return;
    }
    prepareDockElement(element);
    const rect = element.getBoundingClientRect();
    const cachedSize = state.dockSizeMap.get(element) || {};
    const width = Math.max(18, cachedSize.width || element.offsetWidth || rect.width || 34);
    const height = Math.max(18, cachedSize.height || element.offsetHeight || rect.height || 34);
    const liveSize = Math.max(18, Math.min(EDGE_DOCK_LIVE_SIZE, Math.min(slotRect.width, slotRect.height) - 4));
    const scale = Math.min(1, liveSize / width, liveSize / height);
    const left = Math.round(slotRect.left + ((slotRect.width - width) / 2));
    const top = Math.round(slotRect.top + ((slotRect.height - height) / 2));
    element.style.setProperty('position', 'fixed', 'important');
    element.style.setProperty('left', `${left}px`, 'important');
    element.style.setProperty('top', `${top}px`, 'important');
    element.style.setProperty('right', 'auto', 'important');
    element.style.setProperty('bottom', 'auto', 'important');
    element.style.setProperty('z-index', '999997', 'important');
    element.style.setProperty('transform-origin', 'center center', 'important');
    element.style.setProperty('transform', 'none', 'important');
    element.style.setProperty('scale', scale.toFixed(4), 'important');
    element.style.setProperty('animation', 'none', 'important');
    element.style.setProperty('opacity', state.dockOpen ? '1' : '0', 'important');
    element.style.setProperty('visibility', state.dockOpen ? 'visible' : 'hidden', 'important');
    element.style.setProperty('pointer-events', state.dockOpen ? 'auto' : 'none', 'important');
    element.style.setProperty('transition', 'none', 'important');
  }

  function restoreDockElement(element) {
    if (!element || !state.dockHiddenMap.has(element)) {
      return;
    }
    const original = state.dockHiddenMap.get(element) || '';
    if (original) {
      element.setAttribute('style', original);
    } else {
      element.removeAttribute('style');
    }
    state.dockHiddenMap.delete(element);
    state.dockSizeMap.delete(element);
  }

  function unwatchDockElement(itemId) {
    const observer = state.dockElementObserverMap.get(itemId);
    observer?.disconnect?.();
    state.dockElementObserverMap.delete(itemId);
    const frame = state.dockElementAnchorFrameMap.get(itemId);
    if (frame) {
      hostWindow.cancelAnimationFrame?.(frame);
    }
    state.dockElementAnchorFrameMap.delete(itemId);
  }

  function isDockElementAnchored(itemId, element) {
    const slotRect = getDockSlotRect(itemId);
    if (!slotRect || !element?.getBoundingClientRect) {
      return true;
    }
    const rect = element.getBoundingClientRect();
    const expectedX = slotRect.left + (slotRect.width / 2);
    const expectedY = slotRect.top + (slotRect.height / 2);
    const currentX = rect.left + (rect.width / 2);
    const currentY = rect.top + (rect.height / 2);
    return Math.abs(currentX - expectedX) <= 2 && Math.abs(currentY - expectedY) <= 2;
  }

  function watchDockElement(itemId, element) {
    if (!itemId || !element || state.dockElementObserverMap.has(itemId)) {
      return;
    }
    const Observer = hostWindow.MutationObserver || MutationObserver;
    const observer = new Observer(() => {
      if (!state.settings?.edgeDockEnabled || !state.dockElementMap.has(itemId)) {
        return;
      }
      if (isDockElementAnchored(itemId, element)) {
        return;
      }
      if (state.dockElementAnchorFrameMap.has(itemId)) {
        return;
      }
      const frame = hostWindow.requestAnimationFrame(() => {
        state.dockElementAnchorFrameMap.delete(itemId);
        const current = state.dockElementMap.get(itemId);
        const slotRect = getDockSlotRect(itemId);
        if (current && current.isConnected && slotRect) {
          anchorDockElement(current, slotRect);
        }
      });
      state.dockElementAnchorFrameMap.set(itemId, frame);
    });
    observer.observe(element, {
      attributes: true,
      attributeFilter: ['style', 'class'],
    });
    state.dockElementObserverMap.set(itemId, observer);
  }

  function isMutationInsideDockedElement(mutation) {
    const target = mutation?.target;
    if (!target || target.nodeType !== 1) {
      return false;
    }
    for (const element of state.dockElementMap.values()) {
      if (element && (element === target || element.contains?.(target))) {
        return true;
      }
    }
    return false;
  }

  function shouldUsePointerDockDrop(session, clientX, clientY) {
    if (!session || !isFloatingDockableElement(session.element) || !isNearDock(clientX, clientY, 52)) {
      return false;
    }
    return !!session.moved;
  }

  function restoreAllDockElements() {
    Array.from(state.dockElementObserverMap.keys()).forEach(unwatchDockElement);
    Array.from(state.dockElementMap.values()).forEach(restoreDockElement);
    state.dockElementMap.clear();
  }

  function getCiIslandElement() {
    return hostDocument.getElementById('ci-island-container');
  }

  function getCiIslandOptionsElement() {
    return hostDocument.querySelector('.ci-options-container');
  }

  function getCiIslandGripElement() {
    return getCiIslandElement()?.querySelector?.('.ci-drag-grip') || null;
  }

  function clampCiIslandTop(value, element = getCiIslandElement()) {
    const metrics = getViewportMetrics();
    const height = Math.max(72, Math.round(element?.getBoundingClientRect?.().height || element?.offsetHeight || 160));
    return clamp(value, metrics.top + 10, metrics.top + metrics.height - height - 10, metrics.top + 10);
  }

  function getCiIslandSnapEdge(rect) {
    const metrics = getViewportMetrics();
    const leftGap = rect.left - metrics.left;
    const rightGap = (metrics.left + metrics.width) - rect.right;
    if (leftGap <= 40) {
      return 'left';
    }
    if (rightGap <= 40) {
      return 'right';
    }
    return null;
  }

  function hideCiIslandOptions() {
    const options = getCiIslandOptionsElement();
    if (!options) {
      return;
    }
    options.classList.remove('visible');
    options.style.setProperty('opacity', '0', 'important');
    options.style.setProperty('pointer-events', 'none', 'important');
  }

  function showCiIslandOptionsIfNeeded() {
    const options = getCiIslandOptionsElement();
    if (!options) {
      return;
    }
    options.style.removeProperty('opacity');
    options.style.removeProperty('pointer-events');
  }

  function applyCiIslandDockStyle() {
    const element = getCiIslandElement();
    hostDocument.documentElement.classList.toggle(`${PLUGIN_ID}-ci-island-collapsed`, !!(state.ciIslandDocked && state.ciIslandCollapsed));
    if (!element) {
      return;
    }

    element.classList.toggle(`${PLUGIN_ID}-ci-island-edge`, !!state.ciIslandDocked);
    element.classList.toggle(`${PLUGIN_ID}-ci-island-collapsed`, !!(state.ciIslandDocked && state.ciIslandCollapsed));
    element.classList.toggle(`${PLUGIN_ID}-ci-island-expanded`, !!(state.ciIslandDocked && !state.ciIslandCollapsed));
    element.classList.toggle(`${PLUGIN_ID}-ci-island-left`, state.ciIslandDocked && state.ciIslandEdge === 'left');
    element.classList.toggle(`${PLUGIN_ID}-ci-island-right`, state.ciIslandDocked && state.ciIslandEdge === 'right');

    if (!state.ciIslandDocked) {
      showCiIslandOptionsIfNeeded();
      return;
    }

    const metrics = getViewportMetrics();
    const width = state.ciIslandCollapsed ? 16 : Math.max(44, Math.round(element.getBoundingClientRect().width || element.offsetWidth || 44));
    const left = state.ciIslandEdge === 'left'
      ? metrics.left + 4
      : metrics.left + metrics.width - width - 4;
    state.ciIslandTop = clampCiIslandTop(state.ciIslandTop, element);

    element.style.setProperty('position', 'fixed', 'important');
    element.style.setProperty('left', `${Math.round(left)}px`, 'important');
    element.style.setProperty('right', 'auto', 'important');
    element.style.setProperty('top', `${Math.round(state.ciIslandTop)}px`, 'important');
    element.style.setProperty('bottom', 'auto', 'important');
    element.style.setProperty('z-index', '2003', 'important');

    if (state.ciIslandCollapsed) {
      hideCiIslandOptions();
    } else {
      showCiIslandOptionsIfNeeded();
    }
  }

  function dockCiIsland(element, edge, collapse = true) {
    if (!element) {
      return;
    }
    const rect = element.getBoundingClientRect();
    state.ciIslandDocked = true;
    state.ciIslandCollapsed = collapse;
    state.ciIslandEdge = edge === 'left' ? 'left' : 'right';
    state.ciIslandTop = clampCiIslandTop(rect.top, element);
    applyCiIslandDockStyle();
  }

  function expandCiIslandDock() {
    if (!state.ciIslandDocked) {
      return;
    }
    state.ciIslandCollapsed = false;
    applyCiIslandDockStyle();
  }

  function collapseCiIslandDock() {
    if (!state.ciIslandDocked) {
      return;
    }
    state.ciIslandCollapsed = true;
    applyCiIslandDockStyle();
  }

  function releaseCiIslandDock({ preserveRect = true } = {}) {
    const element = getCiIslandElement();
    const rect = preserveRect && element ? element.getBoundingClientRect() : null;
    state.ciIslandDocked = false;
    state.ciIslandCollapsed = false;
    hostDocument.documentElement.classList.remove(`${PLUGIN_ID}-ci-island-collapsed`);
    if (!element) {
      return;
    }

    element.classList.remove(
      `${PLUGIN_ID}-ci-island-edge`,
      `${PLUGIN_ID}-ci-island-collapsed`,
      `${PLUGIN_ID}-ci-island-expanded`,
      `${PLUGIN_ID}-ci-island-left`,
      `${PLUGIN_ID}-ci-island-right`,
    );

    if (rect) {
      const metrics = getViewportMetrics();
      const safeLeft = clamp(rect.left, metrics.left + 8, metrics.left + metrics.width - Math.max(52, rect.width || 44) - 8, rect.left);
      const safeTop = clampCiIslandTop(rect.top, element);
      element.style.setProperty('position', 'fixed', 'important');
      element.style.setProperty('left', `${Math.round(safeLeft)}px`, 'important');
      element.style.setProperty('right', 'auto', 'important');
      element.style.setProperty('top', `${Math.round(safeTop)}px`, 'important');
      element.style.setProperty('bottom', 'auto', 'important');
      element.style.setProperty('z-index', '2000', 'important');
    }
    showCiIslandOptionsIfNeeded();
  }

  function clearCiIslandDragSession() {
    state.ciIslandDragSession = null;
  }

  function syncCiIslandDockState() {
    const element = getCiIslandElement();
    if (!element) {
      return;
    }
    if (state.ciIslandDocked) {
      applyCiIslandDockStyle();
    }
  }

  function startCiIslandEdgeMode() {
    if (typeof state.ciIslandCleanup === 'function') {
      return;
    }

    const onPointerDown = (event) => {
      const island = getCiIslandElement();
      const target = event.target;
      if (state.ciIslandDocked && state.ciIslandCollapsed && target?.closest?.('#ci-island-container')) {
        event.preventDefault();
        expandCiIslandDock();
        return;
      }
      if (state.ciIslandDocked && !state.ciIslandCollapsed && !target?.closest?.('#ci-island-container, .ci-options-container')) {
        collapseCiIslandDock();
        return;
      }
      if (!island || target?.closest?.('#ci-island-container') == null) {
        return;
      }
      const grip = target.closest('.ci-drag-grip');
      if (!grip || (state.ciIslandDocked && state.ciIslandCollapsed)) {
        return;
      }
      state.ciIslandDragSession = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        moved: false,
      };
    };

    const onPointerMove = (event) => {
      const session = state.ciIslandDragSession;
      if (!session || session.pointerId !== event.pointerId) {
        return;
      }
      if (Math.hypot(event.clientX - session.startX, event.clientY - session.startY) > 10) {
        session.moved = true;
      }
    };

    const onPointerUp = (event) => {
      const session = state.ciIslandDragSession;
      clearCiIslandDragSession();
      if (!session || session.pointerId !== event.pointerId || !session.moved) {
        return;
      }
      const island = getCiIslandElement();
      if (!island) {
        return;
      }
      const rect = island.getBoundingClientRect();
      const edge = getCiIslandSnapEdge(rect);
      if (edge) {
        dockCiIsland(island, edge, true);
      } else if (state.ciIslandDocked) {
        releaseCiIslandDock({ preserveRect: true });
      }
    };

    const onViewportChange = () => {
      syncCiIslandDockState();
    };

    const Observer = hostWindow.MutationObserver || MutationObserver;
    state.ciIslandObserver = new Observer(() => {
      syncCiIslandDockState();
    });
    if (hostDocument.body) {
      state.ciIslandObserver.observe(hostDocument.body, {
        childList: true,
        subtree: true,
      });
    }

    hostDocument.addEventListener('pointerdown', onPointerDown, true);
    hostDocument.addEventListener('pointermove', onPointerMove, true);
    hostDocument.addEventListener('pointerup', onPointerUp, true);
    hostWindow.visualViewport?.addEventListener?.('resize', onViewportChange, { passive: true });
    hostWindow.visualViewport?.addEventListener?.('scroll', onViewportChange, { passive: true });
    hostWindow.addEventListener('resize', onViewportChange, { passive: true });
    hostWindow.addEventListener('orientationchange', onViewportChange, { passive: true });

    state.ciIslandCleanup = () => {
      hostDocument.removeEventListener('pointerdown', onPointerDown, true);
      hostDocument.removeEventListener('pointermove', onPointerMove, true);
      hostDocument.removeEventListener('pointerup', onPointerUp, true);
      hostWindow.visualViewport?.removeEventListener?.('resize', onViewportChange);
      hostWindow.visualViewport?.removeEventListener?.('scroll', onViewportChange);
      hostWindow.removeEventListener('resize', onViewportChange);
      hostWindow.removeEventListener('orientationchange', onViewportChange);
      state.ciIslandObserver?.disconnect?.();
      state.ciIslandObserver = null;
      clearCiIslandDragSession();
      releaseCiIslandDock({ preserveRect: true });
      state.ciIslandCleanup = null;
    };
  }

  function buildDockItemFromElement(element) {
    const resolved = resolveDockableElement(element) || element;
    const fingerprint = buildDockFingerprint(resolved);
    if (!isValidDockFingerprint(fingerprint)) {
      return null;
    }
    return {
      id: `dock-${Math.abs(hashText(JSON.stringify(fingerprint))).toString(36)}`,
      name: extractDockName(resolved),
      iconClass: extractDockIconClass(resolved),
      fingerprint,
    };
  }

  function findDockItem(itemId) {
    return state.dockItems.find((item) => item.id === itemId) || null;
  }

  function findDockedItemIdByElement(element) {
    if (!element) {
      return null;
    }
    for (const [itemId, dockElement] of state.dockElementMap.entries()) {
      if (dockElement === element || dockElement?.contains?.(element) || element?.contains?.(dockElement)) {
        return itemId;
      }
    }
    return null;
  }

  function getDockElementForItem(itemId) {
    const item = findDockItem(itemId);
    if (!item) {
      return null;
    }
    const mapped = state.dockElementMap.get(itemId);
    if (mapped?.isConnected) {
      return mapped;
    }
    const found = findDockElementByFingerprint(item.fingerprint);
    if (found) {
      state.dockElementMap.set(itemId, found);
      return found;
    }
    return null;
  }

  function findDockElementByFingerprint(fingerprint) {
    if (!isValidDockFingerprint(fingerprint)) {
      return null;
    }
    const selectors = [];
    if (fingerprint.scriptId) {
      selectors.push(`[script_id="${cssEscape(fingerprint.scriptId)}"]`);
    }
    if (fingerprint.elementId) {
      selectors.push(`#${cssEscape(fingerprint.elementId)}`);
    }
    if (fingerprint.classSelector) {
      selectors.push(fingerprint.classSelector);
    }
    for (const selector of selectors) {
      try {
        const nodes = Array.from(hostDocument.querySelectorAll(selector));
        const match = nodes.find((node) => !isEdgeDockExcludedElement(node) && isDockableElement(node, true) && dockFingerprintsMatch(buildDockFingerprint(node), fingerprint));
        if (match) {
          return match;
        }
      } catch (_) {
        // Ignore invalid selector fragments from third-party buttons.
      }
    }
    if (fingerprint.title) {
      const nodes = Array.from(hostDocument.querySelectorAll('[title], [aria-label], [script_id], button, [role="button"], .menu_button'));
      return nodes.find((node) => !isEdgeDockExcludedElement(node) && isDockableElement(node, true) && dockFingerprintsMatch(buildDockFingerprint(node), fingerprint)) || null;
    }
    return null;
  }

  function pruneExcludedDockItems() {
    if (!state.dockItems.length) {
      return false;
    }
    const keptItems = [];
    let changed = false;
    state.dockItems.forEach((item) => {
      const element = state.dockElementMap.get(item.id) || findDockElementByFingerprint(item.fingerprint);
      if (element && isEdgeDockExcludedElement(element)) {
        restoreDockElement(element);
        state.dockElementMap.delete(item.id);
        changed = true;
        return;
      }
      keptItems.push(item);
    });
    if (changed) {
      state.dockItems = normalizeDockItems(keptItems);
      saveDockItems();
    }
    return changed;
  }

  function scheduleDockSync(delay = 180) {
    hostWindow.clearTimeout(state.dockSyncTimer);
    state.dockSyncTimer = hostWindow.setTimeout(() => {
      state.dockSyncTimer = null;
      syncDockItems();
    }, delay);
  }

  function isNearDock(clientX, clientY, padding = 42) {
    const rect = state.dockRoot?.getBoundingClientRect?.();
    if (!rect) {
      return false;
    }
    const position = state.settings?.edgeDockPosition || DEFAULT_SETTINGS.edgeDockPosition;
    const metrics = getViewportMetrics();
    const { topBarRect, sendFormRect } = getDockAnchorBounds();
    if (position === 'top') {
      const top = Math.max(metrics.top, Math.round((topBarRect?.bottom || metrics.top) - padding));
      const bottom = Math.max(rect.bottom + padding, Math.round((topBarRect?.bottom || rect.top) + padding + 28));
      return clientX >= metrics.left
        && clientX <= metrics.left + metrics.width
        && clientY >= top
        && clientY <= bottom;
    }
    if (position === 'bottom') {
      const bottomAnchor = sendFormRect?.top || (metrics.top + metrics.height);
      const top = Math.min(rect.top - padding, Math.round(bottomAnchor - padding - 42));
      const bottom = Math.min(metrics.top + metrics.height, rect.bottom + padding);
      return clientX >= metrics.left
        && clientX <= metrics.left + metrics.width
        && clientY >= top
        && clientY <= bottom;
    }
    return clientX >= rect.left - padding
      && clientX <= rect.right + padding
      && clientY >= rect.top - padding
      && clientY <= rect.bottom + padding;
  }

  function getDockDragDistance(session, clientX, clientY) {
    return Math.hypot(clientX - session.startX, clientY - session.startY);
  }

  function hasElementMovedFromStart(session) {
    const startRect = session?.startRect;
    const currentRect = session?.element?.getBoundingClientRect?.();
    if (!startRect || !currentRect) {
      return false;
    }
    return Math.hypot(currentRect.left - startRect.left, currentRect.top - startRect.top) > 8;
  }

  function isFloatingDockableElement(element) {
    if (!element || !isDockableElement(element, true)) {
      return false;
    }
    const style = hostWindow.getComputedStyle?.(element);
    return /fixed|absolute|sticky/.test(style?.position || '');
  }

  function isElementNearDock(element, padding = 42) {
    const dockRect = state.dockRoot?.getBoundingClientRect?.();
    const elementRect = element?.getBoundingClientRect?.();
    if (!dockRect || !elementRect) {
      return false;
    }
    return elementRect.right >= dockRect.left - padding
      && elementRect.left <= dockRect.right + padding
      && elementRect.bottom >= dockRect.top - padding
      && elementRect.top <= dockRect.bottom + padding;
  }

  function isPointerOutsideDock(clientX, clientY, padding = 18) {
    const rect = state.dockRoot?.getBoundingClientRect?.();
    if (!rect) {
      return true;
    }
    return clientX < rect.left - padding
      || clientX > rect.right + padding
      || clientY < rect.top - padding
      || clientY > rect.bottom + padding;
  }

  function renderDockSlot(item, element) {
    const slot = hostDocument.createElement('div');
    slot.className = `${PLUGIN_ID}-dock-item`;
    slot.dataset.dockId = item.id;
    slot.title = element ? item.name : `${item.name}（未找到）`;
    if (!element) {
      slot.classList.add('is-missing');
    } else {
      slot.classList.add('has-live-element');
    }
    if (item.iconClass) {
      const icon = hostDocument.createElement('i');
      icon.className = item.iconClass;
      slot.appendChild(icon);
    } else {
      const fallback = hostDocument.createElement('span');
      fallback.textContent = item.name.slice(0, 1) || '•';
      slot.appendChild(fallback);
    }
    return slot;
  }

  function getDockSlotRect(itemId) {
    const slot = state.dockList?.querySelector?.(`[data-dock-id="${cssEscape(itemId)}"]`);
    return slot?.getBoundingClientRect?.() || null;
  }

  function getViewportMetrics() {
    const viewport = hostWindow.visualViewport;
    const width = viewport?.width || hostWindow.innerWidth || hostDocument.documentElement.clientWidth || 0;
    const height = viewport?.height || hostWindow.innerHeight || hostDocument.documentElement.clientHeight || 0;
    return {
      left: Math.round(viewport?.offsetLeft || 0),
      top: Math.round(viewport?.offsetTop || 0),
      width: Math.round(width),
      height: Math.round(height),
    };
  }

  function getChipCenterX() {
    const metrics = getViewportMetrics();
    return Math.round(metrics.left + (metrics.width / 2) + (state.settings?.offsetX || 0));
  }

  function applyChipCenter(chip) {
    if (!chip?.isConnected || chip.classList.contains('zut-closing')) {
      return;
    }
    const centerX = getChipCenterX();
    const gsap = isGsapToastMode() ? getGsap() : null;
    if (gsap) {
      gsap.set(chip, { left: centerX, x: 0, xPercent: -50 });
    } else {
      chip.style.left = `${centerX}px`;
    }
  }

  function scheduleCenterDebugOnce(chip, stage, data = null, extra = {}) {
    if (!state.settings?.centerDebug || !chip) {
      return;
    }
    if (chip.dataset.zutCenterDebugScheduled === 'true') {
      return;
    }
    chip.dataset.zutCenterDebugScheduled = 'true';
    hostWindow.setTimeout(() => {
      delete chip.dataset.zutCenterDebugScheduled;
      logCenterDebug(stage, chip, data, extra);
    }, 0);
  }

  function logCenterDebug(stage, chip, data = null, extra = {}) {
    if (!state.settings?.centerDebug) {
      return;
    }
    const rect = getDebugRect(chip);
    const viewport = getViewportMetrics();
    const targetCenter = getChipCenterX();
    const currentCenter = rect ? Math.round((rect.left + (rect.width / 2)) * 100) / 100 : null;
    const delta = currentCenter == null ? null : Math.round((currentCenter - targetCenter) * 100) / 100;
    const dockRect = state.dockRoot?.getBoundingClientRect?.() || null;
    const parentRect = chip?.parentElement?.getBoundingClientRect?.() || null;
    const payload = {
      stage,
      targetCenter,
      viewport,
      rect,
      currentCenter,
      delta,
      left: chip?.style?.left || '',
      top: chip?.style?.top || '',
      transform: chip?.style?.transform || '',
      className: chip?.className || '',
      parentClassName: chip?.parentElement?.className || '',
      parentRect: parentRect ? getDebugRect(chip.parentElement) : null,
      dockRect: dockRect ? {
        left: Math.round(dockRect.left),
        top: Math.round(dockRect.top),
        width: Math.round(dockRect.width),
        height: Math.round(dockRect.height),
      } : null,
      type: data?.type || '',
      title: data?.title || '',
      message: data?.message || '',
      loadingFx: chip?.dataset?.zutLoadingFx || '',
      startupWide: chip?.dataset?.zutStartupWide || '',
      wide: chip?.dataset?.zutWide || '',
      sourceRect: getDebugRect(data?.sourceToast || null),
      ...extra,
    };
    console.log('[酒馆提示框美化][center-debug]', payload);
    if (hostWindow !== window) {
      try {
        window.console?.log?.('[酒馆提示框美化][center-debug]', payload);
      } catch (_) {
        // Ignore cross-context console issues.
      }
    }
  }

  function getChipMaxWidthPx() {
    const settings = state.settings || DEFAULT_SETTINGS;
    const scale = clamp(settings.scale, 0.72, 1.8, DEFAULT_SETTINGS.scale);
    const configuredMaxWidth = Math.round(settings.maxWidth * scale);
    if (!isProbablyMobileBrowser()) {
      return configuredMaxWidth;
    }
    const metrics = getViewportMetrics();
    return Math.max(180, Math.min(configuredMaxWidth, Math.round(metrics.width - 18)));
  }

  function shouldUseWideChip(data) {
    const title = cleanText(data?.title || statusLabel(data?.type));
    const message = cleanText(data?.message || '');
    const action = cleanText(data?.actionText || '');
    const textLength = `${title} ${message} ${action}`.trim().length;
    return textLength >= 24 || message.length >= 16;
  }

  function applyChipViewportBounds(chip) {
    if (!chip) {
      return;
    }
    const maxWidth = getChipMaxWidthPx();
    const isMobile = isProbablyMobileBrowser();
    chip.style.width = isMobile && chip.dataset.zutWide === 'true' ? `${maxWidth}px` : '';
    chip.style.maxWidth = `${maxWidth}px`;
  }

  function getDockAnchorBounds() {
    const topBar = [
      hostDocument.getElementById('top-settings-holder'),
      hostDocument.querySelector('.top-settings-holder'),
      hostDocument.querySelector('#top-settings-holder .drawer-toggle'),
      hostDocument.getElementById('top-bar'),
    ].find((node) => {
      const rect = node?.getBoundingClientRect?.();
      return rect && rect.width > 0 && rect.height > 0;
    });
    const sendForm = hostDocument.getElementById('send_form')
      || hostDocument.getElementById('form_sheld');
    return {
      topBarRect: topBar?.getBoundingClientRect?.() || null,
      sendFormRect: sendForm?.getBoundingClientRect?.() || null,
    };
  }

  function clampDockShift(position, value) {
    const metrics = getViewportMetrics();
    if (position === 'left' || position === 'right') {
      const limit = Math.max(0, (metrics.height / 2) - 48);
      return clamp(value, -limit, limit, 0);
    }
    const limit = Math.max(0, (metrics.width / 2) - 72);
    return clamp(value, -limit, limit, 0);
  }

  function applyEdgeDockPosition() {
    if (!state.dockRoot || !state.settings?.edgeDockEnabled) {
      return;
    }
    const metrics = getViewportMetrics();
    const { topBarRect, sendFormRect } = getDockAnchorBounds();
    const edgeOffset = clamp(state.settings.edgeDockEdgeOffset, -80, 120, DEFAULT_SETTINGS.edgeDockEdgeOffset);
    const position = state.settings.edgeDockPosition;
    const shiftX = clampDockShift(position, state.settings.edgeDockShiftX || 0);
    const shiftY = clampDockShift(position, state.settings.edgeDockShiftY || 0);
    const style = state.dockRoot.style;
    style.left = 'auto';
    style.right = 'auto';
    style.top = 'auto';
    style.bottom = 'auto';
    style.transform = 'none';

    if (position === 'left') {
      style.left = `${Math.round(metrics.left + edgeOffset)}px`;
      style.top = `${Math.round(metrics.top + (metrics.height / 2) + shiftY)}px`;
      style.transform = 'translateY(-50%)';
      return;
    }

    if (position === 'right') {
      style.left = `${Math.round(metrics.left + metrics.width - edgeOffset)}px`;
      style.top = `${Math.round(metrics.top + (metrics.height / 2) + shiftY)}px`;
      style.transform = 'translate(-100%, -50%)';
      return;
    }

    if (position === 'top') {
      const minTop = metrics.top + edgeOffset;
      const top = Math.max(minTop, Math.round((topBarRect?.bottom || minTop) + edgeOffset));
      style.left = `${Math.round(metrics.left + (metrics.width / 2) + shiftX)}px`;
      style.top = `${top}px`;
      style.transform = 'translateX(-50%)';
      return;
    }

    const fallbackBottomTop = metrics.top + metrics.height - edgeOffset;
    const bottomTop = sendFormRect ? Math.max(metrics.top + edgeOffset, Math.round(sendFormRect.top - edgeOffset)) : fallbackBottomTop;
    style.left = `${Math.round(metrics.left + (metrics.width / 2) + shiftX)}px`;
    style.top = `${bottomTop}px`;
    style.transform = 'translate(-50%, -100%)';
  }

  function alignDockElements() {
    state.dockItems.forEach((item) => {
      const element = state.dockElementMap.get(item.id);
      const slotRect = getDockSlotRect(item.id);
      if (element && slotRect) {
        anchorDockElement(element, slotRect);
      }
    });
  }

  function clearDockAdjustSession() {
    const session = state.dockAdjustSession;
    if (session?.holdTimer) {
      hostWindow.clearTimeout(session.holdTimer);
    }
    state.dockAdjustSession = null;
  }

  function finishDockAdjustSession(commit = false) {
    const session = state.dockAdjustSession;
    if (!session) {
      return;
    }
    clearDockAdjustSession();
    state.dockRoot?.classList?.remove?.('is-adjusting');
    if (commit && session.active) {
      state.settings = normalizeSettings(state.settings);
      saveSettings();
      syncSettingsPanel();
    }
  }

  function updateDockAdjustPosition(clientX, clientY) {
    const session = state.dockAdjustSession;
    if (!session?.active) {
      return;
    }
    if (session.position === 'left' || session.position === 'right') {
      state.settings.edgeDockShiftY = clampDockShift(session.position, session.baseShift + (clientY - session.startY));
    } else {
      state.settings.edgeDockShiftX = clampDockShift(session.position, session.baseShift + (clientX - session.startX));
    }
    applyEdgeDockPosition();
    hostWindow.requestAnimationFrame(() => alignDockElements());
  }

  function startDockViewportListeners() {
    if (state.dockViewportHandler) {
      return;
    }
    state.dockViewportHandler = () => {
      if (!state.settings?.edgeDockEnabled) {
        return;
      }
      renderEdgeDock();
      hostWindow.requestAnimationFrame(() => {
        applyEdgeDockPosition();
        alignDockElements();
      });
    };
    hostWindow.visualViewport?.addEventListener?.('resize', state.dockViewportHandler, { passive: true });
    hostWindow.visualViewport?.addEventListener?.('scroll', state.dockViewportHandler, { passive: true });
    hostWindow.addEventListener('orientationchange', state.dockViewportHandler, { passive: true });
  }

  function stopDockViewportListeners() {
    if (!state.dockViewportHandler) {
      return;
    }
    hostWindow.visualViewport?.removeEventListener?.('resize', state.dockViewportHandler);
    hostWindow.visualViewport?.removeEventListener?.('scroll', state.dockViewportHandler);
    hostWindow.removeEventListener('orientationchange', state.dockViewportHandler);
    state.dockViewportHandler = null;
  }

  function bindDockHandleAdjust() {
    if (!state.dockHandle || typeof state.dockAdjustCleanup === 'function') {
      return;
    }

    const onPointerDown = (event) => {
      if (!state.settings?.edgeDockEnabled || event.button > 0) {
        return;
      }
      try {
        state.dockHandle?.setPointerCapture?.(event.pointerId);
      } catch (_) {
        // Ignore capture failures on older mobile browsers.
      }
      const position = state.settings.edgeDockPosition;
      const session = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        moved: false,
        active: false,
        position,
        baseShift: position === 'left' || position === 'right'
          ? Number(state.settings.edgeDockShiftY || 0)
          : Number(state.settings.edgeDockShiftX || 0),
        holdTimer: hostWindow.setTimeout(() => {
          if (!state.dockAdjustSession || state.dockAdjustSession.pointerId !== event.pointerId) {
            return;
          }
          state.dockAdjustSession.active = true;
          state.dockSuppressToggleUntil = Date.now() + 480;
          state.dockRoot?.classList?.add?.('is-adjusting');
        }, 360),
      };
      state.dockAdjustSession = session;
    };

    const onPointerMove = (event) => {
      const session = state.dockAdjustSession;
      if (!session || session.pointerId !== event.pointerId) {
        return;
      }
      const distance = Math.hypot(event.clientX - session.startX, event.clientY - session.startY);
      if (!session.active && distance > 10) {
        finishDockAdjustSession(false);
        return;
      }
      if (session.active) {
        event.preventDefault();
        session.moved = true;
        updateDockAdjustPosition(event.clientX, event.clientY);
      }
    };

    const onPointerEnd = (event) => {
      const session = state.dockAdjustSession;
      if (!session || session.pointerId !== event.pointerId) {
        return;
      }
      try {
        state.dockHandle?.releasePointerCapture?.(event.pointerId);
      } catch (_) {
        // Ignore release failures.
      }
      if (session.active) {
        event.preventDefault();
        state.dockSuppressToggleUntil = Date.now() + 480;
        finishDockAdjustSession(true);
        return;
      }
      finishDockAdjustSession(false);
    };

    state.dockHandle.addEventListener('pointerdown', onPointerDown, { passive: true });
    state.dockHandle.addEventListener('pointermove', onPointerMove, { passive: false });
    state.dockHandle.addEventListener('pointerup', onPointerEnd, { passive: false });
    state.dockHandle.addEventListener('pointercancel', onPointerEnd, { passive: false });
    state.dockHandle.addEventListener('lostpointercapture', onPointerEnd, { passive: false });
    state.dockAdjustCleanup = () => {
      finishDockAdjustSession(false);
      state.dockHandle?.removeEventListener?.('pointerdown', onPointerDown);
      state.dockHandle?.removeEventListener?.('pointermove', onPointerMove);
      state.dockHandle?.removeEventListener?.('pointerup', onPointerEnd);
      state.dockHandle?.removeEventListener?.('pointercancel', onPointerEnd);
      state.dockHandle?.removeEventListener?.('lostpointercapture', onPointerEnd);
      state.dockAdjustCleanup = null;
    };
  }

  function renderEdgeDock() {
    if (!state.settings?.edgeDockEnabled || !hostDocument.body) {
      stopDockOutsideDismissListener();
      if (typeof state.dockAdjustCleanup === 'function') {
        state.dockAdjustCleanup();
      }
      state.dockRoot?.remove();
      state.dockRoot = null;
      state.dockHandle = null;
      state.dockPanel = null;
      state.dockPresetPanel = null;
      state.dockList = null;
      return;
    }

    if (!state.dockRoot || !hostDocument.body.contains(state.dockRoot)) {
      const root = hostDocument.createElement('div');
      root.id = EDGE_DOCK_ID;

      const handle = hostDocument.createElement('button');
      handle.type = 'button';
      handle.className = `${PLUGIN_ID}-dock-handle`;
      handle.dataset.action = 'toggle';

      const count = hostDocument.createElement('span');
      count.className = `${PLUGIN_ID}-dock-count`;
      handle.appendChild(count);

      const stack = hostDocument.createElement('div');
      stack.className = `${PLUGIN_ID}-dock-stack`;

      const presetPanel = hostDocument.createElement('div');
      presetPanel.className = `${PLUGIN_ID}-dock-panel ${PLUGIN_ID}-dock-preset-panel`;
      presetPanel.addEventListener('click', (event) => {
        const presetId = event.target?.closest?.('[data-preset-apply]')?.dataset?.presetApply;
        if (presetId) {
          event.stopPropagation();
          applyColorPreset(presetId);
        }
      });

      const panel = hostDocument.createElement('div');
      panel.className = `${PLUGIN_ID}-dock-panel ${PLUGIN_ID}-dock-items-panel`;

      const list = hostDocument.createElement('div');
      list.className = `${PLUGIN_ID}-dock-list`;

      panel.appendChild(list);
      stack.appendChild(presetPanel);
      stack.appendChild(panel);
      root.appendChild(handle);
      root.appendChild(stack);
      hostDocument.body.appendChild(root);

      root.addEventListener('click', (event) => {
        const action = event.target?.closest?.('[data-action]')?.dataset?.action;
        if (action === 'toggle') {
          if (Date.now() < state.dockSuppressToggleUntil) {
            return;
          }
          state.dockOpen = !state.dockOpen;
          renderEdgeDock();
          return;
        }
      });

      root.addEventListener('contextmenu', (event) => {
        const itemButton = event.target?.closest?.(`[data-dock-id]`);
        if (!itemButton) {
          return;
        }
        event.preventDefault();
        removeDockItem(itemButton.dataset.dockId);
      });

      state.dockRoot = root;
      state.dockHandle = handle;
      state.dockPanel = panel;
      state.dockPresetPanel = presetPanel;
      state.dockList = list;
      bindDockHandleAdjust();
    }

    const shouldShowPanel = state.dockOpen;
    state.dockRoot.className = `${PLUGIN_ID}-edge-dock ${PLUGIN_ID}-edge-dock--${state.settings.edgeDockPosition}${shouldShowPanel ? ' is-open' : ''}${state.dockItems.length > 0 ? ' has-items' : ''}`;
    state.dockHandle.setAttribute('aria-expanded', state.dockOpen ? 'true' : 'false');
    state.dockHandle.title = state.dockOpen ? '收起收纳栏' : '展开收纳栏';
    state.dockHandle.setAttribute('aria-label', `${state.dockOpen ? '收起' : '展开'}收纳栏，长按可调整位置`);
    state.dockHandle.querySelector(`.${PLUGIN_ID}-dock-count`).textContent = '';

    renderDockPresetSwitcher();
    state.dockList.replaceChildren();
    state.dockItems.forEach((item) => {
      state.dockList.appendChild(renderDockSlot(item, state.dockElementMap.get(item.id) || null));
    });
    applyEdgeDockPosition();
    hostWindow.requestAnimationFrame(() => {
      applyEdgeDockPosition();
      alignDockElements();
    });
  }

  function syncDockItems() {
    if (!state.settings?.edgeDockEnabled) {
      return;
    }
    pruneExcludedDockItems();

    const previousMap = state.dockElementMap;
    const nextMap = new Map();
    state.dockItems.forEach((item) => {
      const current = state.dockElementMap.get(item.id);
      const element = current && current.isConnected && dockFingerprintsMatch(buildDockFingerprint(current), item.fingerprint)
        ? current
        : findDockElementByFingerprint(item.fingerprint);
      if (element) {
        nextMap.set(item.id, element);
      }
    });

    previousMap.forEach((element, itemId) => {
      if (!nextMap.has(itemId) || nextMap.get(itemId) !== element) {
        unwatchDockElement(itemId);
        restoreDockElement(element);
      }
    });

    state.dockElementMap = nextMap;
    state.dockElementObserverMap.forEach((observer, itemId) => {
      const element = state.dockElementMap.get(itemId);
      if (!element || !element.isConnected) {
        unwatchDockElement(itemId);
      }
    });
    let changed = previousMap.size !== nextMap.size;
    nextMap.forEach((element, itemId) => {
      if (previousMap.get(itemId) !== element) {
        changed = true;
      }
    });
    state.dockElementMap.forEach((element, itemId) => {
      watchDockElement(itemId, element);
    });
    if (changed) {
      renderEdgeDock();
      syncSettingsPanel();
    } else {
      alignDockElements();
    }
  }

  function startDockObserver() {
    if (state.dockMutationObserver || !hostDocument.body) {
      return;
    }
    const Observer = hostWindow.MutationObserver || MutationObserver;
    state.dockMutationObserver = new Observer((mutations) => {
      if (mutations.length && mutations.every(isMutationInsideDockedElement)) {
        hostWindow.requestAnimationFrame(() => alignDockElements());
        return;
      }
      scheduleDockSync();
    });
    state.dockMutationObserver.observe(hostDocument.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class'],
    });
  }

  function stopDockObserver() {
    state.dockMutationObserver?.disconnect?.();
    state.dockMutationObserver = null;
    hostWindow.clearTimeout(state.dockSyncTimer);
    state.dockSyncTimer = null;
  }

  function clearDockDragSession() {
    state.dockDragSession = null;
  }

  function isDockInteractionTarget(target) {
    if (!target) {
      return false;
    }
    if (state.dockRoot?.contains?.(target)) {
      return true;
    }
    for (const element of state.dockElementMap.values()) {
      if (element && (element === target || element.contains?.(target))) {
        return true;
      }
    }
    return false;
  }

  function startDockOutsideDismissListener() {
    if (typeof state.dockOutsideCleanup === 'function') {
      return;
    }

    const maybeCollapse = (event) => {
      if (!state.settings?.edgeDockEnabled || !state.dockOpen) {
        return;
      }
      if (Date.now() < state.dockSuppressToggleUntil || state.dockAdjustSession || state.dockDragSession) {
        return;
      }
      if (isDockInteractionTarget(event.target)) {
        return;
      }
      state.dockOpen = false;
      renderEdgeDock();
    };

    hostDocument.addEventListener('pointerdown', maybeCollapse, true);
    hostDocument.addEventListener('touchstart', maybeCollapse, true);
    state.dockOutsideCleanup = () => {
      hostDocument.removeEventListener('pointerdown', maybeCollapse, true);
      hostDocument.removeEventListener('touchstart', maybeCollapse, true);
      state.dockOutsideCleanup = null;
    };
  }

  function stopDockOutsideDismissListener() {
    if (typeof state.dockOutsideCleanup === 'function') {
      state.dockOutsideCleanup();
    }
    state.dockOutsideCleanup = null;
  }

  function startDockDragSession(element, clientX, clientY) {
    const dockedItemId = findDockedItemIdByElement(element);
    state.dockDragSession = {
      type: dockedItemId ? 'release' : 'capture',
      itemId: dockedItemId,
      element,
      startRect: element.getBoundingClientRect?.() || null,
      startX: clientX,
      startY: clientY,
      moved: false,
      released: false,
    };
  }

  function startDockReleaseSession(itemId, element, clientX, clientY) {
    if (!itemId || !findDockItem(itemId)) {
      return;
    }
    const resolved = element || getDockElementForItem(itemId);
    state.dockDragSession = {
      type: 'release',
      itemId,
      element: resolved,
      startRect: resolved?.getBoundingClientRect?.() || null,
      startX: clientX,
      startY: clientY,
      moved: false,
      released: false,
    };
  }

  function handleDockDragStart(target, clientX, clientY) {
    if (!state.settings?.edgeDockEnabled) {
      return;
    }
    const dockSlot = target?.closest?.(`#${EDGE_DOCK_ID} [data-dock-id]`);
    if (dockSlot?.dataset?.dockId) {
      startDockReleaseSession(dockSlot.dataset.dockId, getDockElementForItem(dockSlot.dataset.dockId), clientX, clientY);
      return;
    }
    if (isCompatibleIslandElement(target)) {
      return;
    }
    if (target?.closest?.(`#${EDGE_DOCK_ID}, #${PANEL_ID}, #${LAYER_ID}`)) {
      return;
    }
    if (isEdgeDockExcludedElement(target)) {
      return;
    }
    const element = resolveDockableElement(target)
      || target?.closest?.('button, [role="button"], .menu_button, .interactable, [script_id], .ui-draggable');
    if (!isDockableElement(element, true)) {
      return;
    }
    const dockedItemId = findDockedItemIdByElement(element);
    if (!dockedItemId && state.settings?.edgeDockDropCapture === false) {
      return;
    }
    startDockDragSession(element, clientX, clientY);
  }

  function handleDockDragMove(clientX, clientY) {
    const session = state.dockDragSession;
    if (!session) {
      return;
    }
    const distance = getDockDragDistance(session, clientX, clientY);
    if (distance > 10) {
      session.moved = true;
    }
    if (session.type === 'release' && session.itemId && !session.released) {
      if (distance > 24 && isPointerOutsideDock(clientX, clientY, 12)) {
        session.released = true;
        removeDockItem(session.itemId);
      }
    }
  }

  function handleDockDragEnd(clientX, clientY) {
    const session = state.dockDragSession;
    clearDockDragSession();
    if (!session || !session.moved) {
      return;
    }
    const allowPointerDrop = shouldUsePointerDockDrop(session, clientX, clientY);
    if (session.type === 'capture' && (hasElementMovedFromStart(session) ? isElementNearDock(session.element, 52) : allowPointerDrop)) {
      addDockItemFromElement(session.element);
      return;
    }
    if (session.type === 'release' && session.released) {
      scheduleDockSync(120);
      return;
    }
    if (session.type === 'release' && session.itemId && isPointerOutsideDock(clientX, clientY, 12)) {
      removeDockItem(session.itemId);
      scheduleDockSync(120);
    }
  }

  function startDockDragListeners() {
    if (typeof state.dockCaptureCleanup === 'function') {
      return;
    }

    const onPointerDown = (event) => {
      handleDockDragStart(event.target, event.clientX, event.clientY);
    };
    const onPointerMove = (event) => {
      handleDockDragMove(event.clientX, event.clientY);
    };
    const onPointerUp = (event) => {
      handleDockDragEnd(event.clientX, event.clientY);
    };
    const onTouchStart = (event) => {
      const touch = event.touches?.[0];
      if (!touch) {
        return;
      }
      handleDockDragStart(event.target, touch.clientX, touch.clientY);
    };
    const onTouchMove = (event) => {
      const touch = event.touches?.[0];
      if (!touch) {
        return;
      }
      handleDockDragMove(touch.clientX, touch.clientY);
    };
    const onTouchEnd = (event) => {
      const touch = event.changedTouches?.[0];
      if (!touch) {
        clearDockDragSession();
        return;
      }
      handleDockDragEnd(touch.clientX, touch.clientY);
    };
    const onKeydown = (event) => {
      if (event.key === 'Escape') {
        clearDockDragSession();
      }
    };

    hostDocument.addEventListener('pointerdown', onPointerDown, true);
    hostDocument.addEventListener('pointermove', onPointerMove, true);
    hostDocument.addEventListener('pointerup', onPointerUp, true);
    hostDocument.addEventListener('touchstart', onTouchStart, true);
    hostDocument.addEventListener('touchmove', onTouchMove, true);
    hostDocument.addEventListener('touchend', onTouchEnd, true);
    hostDocument.addEventListener('keydown', onKeydown, true);

    state.dockCaptureCleanup = () => {
      hostDocument.removeEventListener('pointerdown', onPointerDown, true);
      hostDocument.removeEventListener('pointermove', onPointerMove, true);
      hostDocument.removeEventListener('pointerup', onPointerUp, true);
      hostDocument.removeEventListener('touchstart', onTouchStart, true);
      hostDocument.removeEventListener('touchmove', onTouchMove, true);
      hostDocument.removeEventListener('touchend', onTouchEnd, true);
      hostDocument.removeEventListener('keydown', onKeydown, true);
    };
  }

  function stopDockCaptureMode() {
    state.dockCaptureActive = false;
    state.dockCaptureSourceElement = null;
    hostDocument.getElementById(EDGE_DOCK_CAPTURE_ID)?.remove();
  }

  function addDockItemFromElement(element) {
    const resolved = resolveDockableElement(element) || element;
    if (resolved?.id === 'ci-island-container') {
      showChip({ type: 'info', title: '浮岛收纳', message: '这个浮岛已改为边缘吸附模式，直接把它拖到屏幕左右边缘即可收纳。' });
      return false;
    }
    const item = buildDockItemFromElement(resolved);
    if (!item) {
      return false;
    }
    if (state.dockItems.some((existing) => dockFingerprintsMatch(existing.fingerprint, item.fingerprint))) {
      showChip({ type: 'warning', title: '边缘收纳', message: '这个按钮已经收纳过了。' });
      return false;
    }
    state.dockItems = normalizeDockItems([...state.dockItems, item]);
    state.dockElementMap.set(item.id, resolved);
    saveDockItems();
    renderEdgeDock();
    syncDockItems();
    showChip({ type: 'success', title: '边缘收纳', message: `已收纳：${item.name}` });
    return true;
  }

  function startDockCaptureMode() {
    state.dockOpen = true;
    renderEdgeDock();
  }

  function toggleDockCaptureMode() {
    if (!state.settings?.edgeDockEnabled) {
      state.settings.edgeDockEnabled = true;
      state.settings = normalizeSettings(state.settings);
      applySettings();
      saveSettings();
    }
    startDockCaptureMode();
  }

  function removeDockItem(itemId) {
    const item = findDockItem(itemId);
    if (!item) {
      return;
    }
    const element = getDockElementForItem(itemId);
    if (element) {
      unwatchDockElement(itemId);
      restoreDockElement(element);
      state.dockElementMap.delete(itemId);
    }
    state.dockItems = state.dockItems.filter((entry) => entry.id !== itemId);
    saveDockItems();
    renderEdgeDock();
    syncSettingsPanel();
  }

  function clearDockItems() {
    Array.from(state.dockElementObserverMap.keys()).forEach(unwatchDockElement);
    restoreAllDockElements();
    state.dockItems = [];
    saveDockItems();
    renderEdgeDock();
    syncSettingsPanel();
  }

  function syncEdgeDockMode() {
    if (!state.settings?.edgeDockEnabled) {
      stopDockCaptureMode();
      stopDockObserver();
      stopDockViewportListeners();
      stopDockOutsideDismissListener();
      if (typeof state.dockCaptureCleanup === 'function') {
        state.dockCaptureCleanup();
      }
      state.dockCaptureCleanup = null;
      clearDockDragSession();
      restoreAllDockElements();
      state.dockOpen = false;
      renderEdgeDock();
      return;
    }
    startDockObserver();
    startDockViewportListeners();
    startDockDragListeners();
    startDockOutsideDismissListener();
    renderEdgeDock();
    scheduleDockSync(60);
  }

  function cleanupEdgeDock() {
    stopDockCaptureMode();
    stopDockObserver();
    stopDockViewportListeners();
    stopDockOutsideDismissListener();
    if (typeof state.dockCaptureCleanup === 'function') {
      state.dockCaptureCleanup();
    }
    state.dockCaptureCleanup = null;
    if (typeof state.dockAdjustCleanup === 'function') {
      state.dockAdjustCleanup();
    }
    clearDockDragSession();
    restoreAllDockElements();
    state.dockRoot?.remove();
    state.dockRoot = null;
    state.dockHandle = null;
    state.dockPanel = null;
    state.dockList = null;
    state.dockOpen = false;
  }

  function injectStyle() {
    hostDocument.getElementById(STYLE_ID)?.remove();
    const style = hostDocument.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${LAYER_ID} {
        position: fixed;
        left: 0;
        top: 0;
        width: 0;
        height: 0;
        z-index: 999999;
        pointer-events: none;
        overflow: visible;
        background: transparent !important;
      }

      .${PLUGIN_ID}-chip {
        position: fixed;
        display: flex;
        box-sizing: border-box;
        align-items: center;
        justify-content: center;
        gap: var(--zut-chip-gap, 7px);
        width: fit-content;
        min-width: 0;
        max-width: min(var(--zut-chip-max-width, 520px), calc(100dvw - 20px));
        padding: var(--zut-chip-padding-y, 5px) var(--zut-chip-padding-x, 9px);
        border: 1px solid color-mix(in srgb, var(--zut-accent, #77b7ff) 42%, transparent);
        border-radius: var(--zut-chip-radius, 7px);
        background:
          linear-gradient(115deg, rgba(255,255,255,0.12), transparent 38%),
          rgb(var(--zut-bg-rgb, 16 20 25) / 0.86);
        color: var(--zut-text-color, #eef6ff);
        box-shadow:
          0 8px 18px rgba(0, 0, 0, 0.30),
          0 0 15px color-mix(in srgb, var(--zut-accent, #77b7ff) 28%, transparent);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        font: var(--zut-chip-font-size, 11px)/1.35 var(--mainFontFamily, "Noto Sans SC", sans-serif);
        pointer-events: auto;
        transform: translate3d(-50%, -10px, 0) scale(0.94);
        transform-origin: 50% 0%;
        opacity: 0;
        clip-path: inset(0 100% 0 0 round var(--zut-chip-radius, 7px));
        animation: zut-pop-in 620ms cubic-bezier(.16, 1, .3, 1) forwards;
        transition:
          top 280ms cubic-bezier(.22, 1, .36, 1),
          left 280ms cubic-bezier(.22, 1, .36, 1),
          box-shadow 220ms ease,
          border-color 220ms ease;
        overflow: hidden;
        will-change: transform, opacity, clip-path;
      }

      .${PLUGIN_ID}-chip[data-zut-has-action="true"] {
        min-width: 0;
        padding-right: var(--zut-chip-padding-x, 9px);
      }

      .${PLUGIN_ID}-chip[data-zut-has-action="true"] .${PLUGIN_ID}-title,
      .${PLUGIN_ID}-chip[data-zut-has-action="true"] .${PLUGIN_ID}-text {
        transform: none;
      }

      .${PLUGIN_ID}-chip[data-zut-has-action="true"] .${PLUGIN_ID}-action {
        position: relative;
        right: auto;
        top: auto;
        transform: none;
        z-index: 2;
      }

      .${PLUGIN_ID}-scan,
      .${PLUGIN_ID}-ring {
        position: absolute;
        pointer-events: none;
      }

      .${PLUGIN_ID}-scan {
        left: 0;
        top: 0;
        width: 72px;
        height: 100%;
        background:
          linear-gradient(90deg, transparent 0 10%, color-mix(in srgb, var(--zut-accent, #77b7ff) 68%, white) 48%, transparent 92%),
          radial-gradient(circle at 50% 50%, rgba(255,255,255,.68), transparent 62%);
        transform: translateX(-155%) skewX(-14deg);
        filter: blur(.28px);
        opacity: 0;
        z-index: 0;
      }

      .${PLUGIN_ID}-ring {
        inset: -1px;
        border-radius: inherit;
        border: 1px solid color-mix(in srgb, var(--zut-accent, #77b7ff) 64%, transparent);
        opacity: 0;
        transform: scale(0.94);
        z-index: 0;
      }

      .${PLUGIN_ID}-chip::before {
        content: "";
        position: absolute;
        left: 0;
        top: 0;
        width: 72px;
        height: 100%;
        background:
          linear-gradient(90deg, transparent 0 10%, color-mix(in srgb, var(--zut-accent, #77b7ff) 68%, white) 48%, transparent 92%),
          radial-gradient(circle at 50% 50%, rgba(255,255,255,.68), transparent 62%);
        transform: translateX(-155%) skewX(-14deg);
        filter: blur(.28px);
        animation: zut-island-scan 780ms cubic-bezier(.16, 1, .3, 1) 45ms 1;
        opacity: 0;
        pointer-events: none;
      }

      .${PLUGIN_ID}-chip::after {
        content: "";
        position: absolute;
        inset: -1px;
        border-radius: inherit;
        border: 1px solid color-mix(in srgb, var(--zut-accent, #77b7ff) 64%, transparent);
        opacity: 0;
        transform: scale(0.94);
        animation: zut-ring 700ms cubic-bezier(.16, 1, .3, 1) 50ms 1;
        pointer-events: none;
      }

      .${PLUGIN_ID}-chip.zut-closing {
        pointer-events: none;
        clip-path: inset(0 0 0 0 round var(--zut-chip-radius, 7px));
        animation: zut-fly-back 380ms cubic-bezier(.4, 0, .2, 1) forwards !important;
      }

      :root.${PLUGIN_ID}-gsap-toast-on .${PLUGIN_ID}-chip {
        animation: none;
        opacity: 1;
        clip-path: inset(0 0 0 0 round var(--zut-chip-radius, 7px));
        transition:
          box-shadow 220ms ease,
          border-color 220ms ease;
        will-change: transform, opacity, clip-path, left, top;
      }

      :root.${PLUGIN_ID}-gsap-toast-on .${PLUGIN_ID}-chip::before,
      :root.${PLUGIN_ID}-gsap-toast-on .${PLUGIN_ID}-chip::after,
      :root.${PLUGIN_ID}-gsap-toast-on .${PLUGIN_ID}-chip.zut-closing {
        animation: none !important;
      }

      :root.${PLUGIN_ID}-gsap-toast-on .${PLUGIN_ID}-chip::before,
      :root.${PLUGIN_ID}-gsap-toast-on .${PLUGIN_ID}-chip::after {
        display: none;
      }

      .${PLUGIN_ID}-title {
        display: flex;
        align-items: center;
        gap: 5px;
        flex: 0 0 auto;
        max-width: var(--zut-title-max-width, 120px);
        color: color-mix(in srgb, var(--zut-accent, #77b7ff) 82%, white);
        font-size: var(--zut-chip-font-size, 11px);
        font-weight: 700;
        white-space: nowrap;
        position: relative;
        z-index: 1;
      }

      .${PLUGIN_ID}-title-text {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .${PLUGIN_ID}-chip.${PLUGIN_ID}-startup-wide {
        justify-content: center;
        gap: 5px;
        white-space: nowrap;
      }

      .${PLUGIN_ID}-chip.${PLUGIN_ID}-startup-wide .${PLUGIN_ID}-title {
        flex: 0 1 auto;
        max-width: calc(100% - 14px);
        justify-content: center;
        color: color-mix(in srgb, var(--zut-text-color, #eef6ff) 96%, white);
        text-shadow: 0 0 10px color-mix(in srgb, var(--zut-accent, #77b7ff) 14%, transparent);
      }

      .${PLUGIN_ID}-chip.${PLUGIN_ID}-startup-wide .${PLUGIN_ID}-text {
        display: none;
      }

      .${PLUGIN_ID}-chip.${PLUGIN_ID}-startup-wide .${PLUGIN_ID}-title-text {
        max-width: none;
        white-space: nowrap;
      }

      .${PLUGIN_ID}-dot {
        width: var(--zut-dot-size, 6px);
        height: var(--zut-dot-size, 6px);
        border-radius: 99px;
        background: var(--zut-accent, #77b7ff);
        box-shadow: 0 0 10px var(--zut-accent, #77b7ff);
        flex: 0 0 auto;
      }

      .${PLUGIN_ID}-loader {
        position: relative;
        display: none;
        width: 18px;
        height: 18px;
        flex: 0 0 auto;
        border-radius: 999px;
        isolation: isolate;
      }

      .${PLUGIN_ID}-loader span {
        position: absolute;
        inset: 0;
        border-radius: inherit;
        pointer-events: none;
      }

      .${PLUGIN_ID}-loading-blackhole {
        justify-content: center;
        align-items: center;
        flex-wrap: nowrap;
        gap: 6px;
        width: fit-content;
        min-width: 0;
        max-width: min(var(--zut-chip-max-width, 520px), calc(100dvw - 20px));
        text-align: left;
        box-shadow:
          0 9px 22px rgba(0, 0, 0, 0.34),
          0 0 18px color-mix(in srgb, var(--zut-accent, #77b7ff) 36%, transparent);
      }

      .${PLUGIN_ID}-loading-blackhole[data-zut-has-action="true"] {
        min-width: 0;
        padding-right: var(--zut-chip-padding-x, 9px) !important;
        padding-left: var(--zut-chip-padding-x, 9px) !important;
      }

      .${PLUGIN_ID}-loading-blackhole[data-zut-has-action="true"] .${PLUGIN_ID}-title,
      .${PLUGIN_ID}-loading-blackhole[data-zut-has-action="true"] .${PLUGIN_ID}-text,
      .${PLUGIN_ID}-loading-blackhole[data-zut-has-action="true"] .${PLUGIN_ID}-action {
        transform: none !important;
      }

      .${PLUGIN_ID}-loading-blackhole .${PLUGIN_ID}-title,
      .${PLUGIN_ID}-loading-blackhole .${PLUGIN_ID}-text {
        flex: 0 1 auto;
        width: auto;
        min-width: 0;
        max-width: 100%;
        text-align: left;
      }

      .${PLUGIN_ID}-loading-blackhole .${PLUGIN_ID}-title {
        max-width: min(180px, 34vw);
        justify-content: flex-start;
        gap: 5px;
      }

      .${PLUGIN_ID}-loading-blackhole .${PLUGIN_ID}-dot {
        display: none;
      }

      .${PLUGIN_ID}-loading-blackhole .${PLUGIN_ID}-loader {
        display: inline-block;
        width: 18px;
        height: 18px;
        flex: 0 0 18px;
        vertical-align: middle;
        background:
          radial-gradient(circle at 50% 50%, rgba(0,0,0,.98) 0 24%, transparent 27%),
          conic-gradient(from 0deg,
            transparent 0 8%,
            color-mix(in srgb, var(--zut-accent, #77b7ff) 86%, white) 11%,
            transparent 16% 27%,
            color-mix(in srgb, var(--zut-warning-accent, #ffd166) 68%, var(--zut-accent, #77b7ff)) 31%,
            transparent 36% 48%,
            color-mix(in srgb, var(--zut-success-accent, #6ee7a8) 58%, var(--zut-accent, #77b7ff)) 52%,
            transparent 57% 70%,
            color-mix(in srgb, var(--zut-error-accent, #ff6b7a) 46%, var(--zut-accent, #77b7ff)) 74%,
            transparent 80% 100%);
        box-shadow:
          0 0 12px color-mix(in srgb, var(--zut-accent, #77b7ff) 48%, transparent),
          inset 0 0 7px rgba(0, 0, 0, .92);
        animation: zut-blackhole-spin 1.18s linear infinite;
      }

      .${PLUGIN_ID}-loading-blackhole .${PLUGIN_ID}-loader::before,
      .${PLUGIN_ID}-loading-blackhole .${PLUGIN_ID}-loader::after,
      .${PLUGIN_ID}-loading-blackhole .${PLUGIN_ID}-loader span {
        position: absolute;
        left: 50%;
        top: 50%;
        transform-origin: 50% 50%;
      }

      .${PLUGIN_ID}-loading-blackhole .${PLUGIN_ID}-loader span:nth-child(1) {
        inset: 1px;
        border: 1px solid color-mix(in srgb, var(--zut-accent, #77b7ff) 72%, transparent);
        border-left-color: color-mix(in srgb, var(--zut-warning-accent, #ffd166) 80%, transparent);
        border-bottom-color: transparent;
        transform: rotateX(64deg) rotateZ(0deg);
        filter: blur(.1px);
        animation: zut-blackhole-ring 0.92s linear infinite;
      }

      .${PLUGIN_ID}-loading-blackhole .${PLUGIN_ID}-loader span:nth-child(2) {
        inset: 3px;
        background:
          conic-gradient(from 95deg,
            transparent 0 10%,
            color-mix(in srgb, var(--zut-success-accent, #6ee7a8) 82%, white) 13%,
            transparent 18% 34%,
            color-mix(in srgb, var(--zut-accent, #77b7ff) 72%, white) 38%,
            transparent 43% 63%,
            color-mix(in srgb, var(--zut-warning-accent, #ffd166) 74%, white) 67%,
            transparent 72% 100%);
        opacity: .86;
        filter: blur(.2px);
        animation: zut-blackhole-reverse 1.74s linear infinite;
      }

      .${PLUGIN_ID}-loading-blackhole .${PLUGIN_ID}-loader span:nth-child(3) {
        inset: -4px;
        background:
          radial-gradient(circle at 50% 0%, color-mix(in srgb, var(--zut-accent, #77b7ff) 72%, transparent) 0 5%, transparent 7%),
          radial-gradient(circle at 92% 46%, color-mix(in srgb, var(--zut-warning-accent, #ffd166) 76%, transparent) 0 4%, transparent 6%),
          radial-gradient(circle at 25% 91%, color-mix(in srgb, var(--zut-success-accent, #6ee7a8) 70%, transparent) 0 4%, transparent 6%),
          radial-gradient(circle at 9% 30%, color-mix(in srgb, var(--zut-error-accent, #ff6b7a) 56%, transparent) 0 3%, transparent 5%),
          radial-gradient(circle, color-mix(in srgb, var(--zut-accent, #77b7ff) 34%, transparent), transparent 58%);
        opacity: .74;
        filter: blur(.35px);
        animation: zut-blackhole-dots 2.35s linear infinite;
      }

      .${PLUGIN_ID}-loading-blackhole .${PLUGIN_ID}-loader::before {
        content: "";
        position: absolute;
        inset: -3px;
        border-radius: inherit;
        background: radial-gradient(circle, color-mix(in srgb, var(--zut-accent, #77b7ff) 38%, transparent), transparent 60%);
        opacity: .48;
        filter: blur(5px);
        animation: zut-blackhole-breathe 1.6s ease-in-out infinite;
      }

      .${PLUGIN_ID}-loading-blackhole .${PLUGIN_ID}-loader::after {
        content: "";
        position: absolute;
        inset: 6px;
        border-radius: inherit;
        background: rgba(0, 0, 0, .98);
        box-shadow: inset 0 0 5px rgba(255,255,255,.08);
      }

      .${PLUGIN_ID}-loading-blackhole .${PLUGIN_ID}-text {
        flex: 0 1 auto;
        min-width: 0;
        max-width: min(260px, 42vw);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        text-align: left;
      }

      .${PLUGIN_ID}-loading-blackhole .${PLUGIN_ID}-action {
        position: relative;
        right: auto;
        top: auto;
        transform: none !important;
        white-space: nowrap;
        flex: 0 0 auto;
        align-self: center;
        margin: 0 0 0 2px;
      }

      /* ===== 星轨折跃 / Hyperspace Warp ===== */
      .${PLUGIN_ID}-fx-starwarp {
        overflow: hidden;
        isolation: isolate;
        border-color: color-mix(in srgb, var(--zut-accent, #77b7ff) 52%, transparent);
        background:
          radial-gradient(140% 165% at 50% 50%, transparent 16%, rgb(var(--zut-bg-rgb, 16 20 25) / .55) 56%, rgb(var(--zut-bg-rgb, 16 20 25) / .97) 100%),
          radial-gradient(circle at 50% 46%, color-mix(in srgb, var(--zut-accent, #77b7ff) 24%, transparent), transparent 40%),
          rgb(var(--zut-bg-rgb, 16 20 25) / .95);
        box-shadow:
          0 16px 40px rgba(0, 0, 0, .42),
          0 0 28px color-mix(in srgb, var(--zut-accent, #77b7ff) 26%, transparent),
          inset 0 0 26px rgba(0, 0, 0, .5),
          inset 0 1px 0 rgba(255, 255, 255, .14);
      }

      /* 漂移星场：细密星点缓慢闪烁，营造纵深 */
      .${PLUGIN_ID}-fx-starwarp::before {
        content: "";
        position: absolute;
        inset: 0;
        pointer-events: none;
        z-index: 0;
        background-image:
          radial-gradient(1.4px 1.4px at 18% 32%, #fff, transparent 60%),
          radial-gradient(1.2px 1.2px at 73% 58%, color-mix(in srgb, var(--zut-accent, #77b7ff) 80%, #fff), transparent 60%),
          radial-gradient(1px 1px at 42% 78%, #fff, transparent 60%),
          radial-gradient(1.3px 1.3px at 88% 24%, color-mix(in srgb, var(--zut-success-accent, #6ee7a8) 70%, #fff), transparent 60%),
          radial-gradient(1px 1px at 58% 12%, #fff, transparent 60%),
          radial-gradient(1.1px 1.1px at 9% 62%, #fff, transparent 60%),
          radial-gradient(1px 1px at 32% 50%, color-mix(in srgb, var(--zut-warning-accent, #ffd166) 70%, #fff), transparent 60%),
          radial-gradient(1.2px 1.2px at 66% 88%, #fff, transparent 60%);
        opacity: .5;
        mix-blend-mode: screen;
        animation: zut-warp-twinkle 3.6s ease-in-out infinite;
      }

      /* 折跃光轨：从灭点放射的光线向外冲刺，模拟跃迁瞬间 */
      .${PLUGIN_ID}-fx-starwarp::after {
        content: "";
        position: absolute;
        inset: -70%;
        pointer-events: none;
        z-index: 0;
        background:
          repeating-conic-gradient(from 0deg at 50% 50%,
            transparent 0 4deg,
            color-mix(in srgb, var(--zut-accent, #77b7ff) 55%, #fff) 4deg 4.5deg,
            transparent 4.5deg 9deg);
        -webkit-mask-image: radial-gradient(circle at 50% 50%, transparent 6%, #000 26%, transparent 64%);
                mask-image: radial-gradient(circle at 50% 50%, transparent 6%, #000 26%, transparent 64%);
        opacity: 0;
        transform: scale(.42);
        mix-blend-mode: screen;
        animation: zut-warp-rush 2.6s cubic-bezier(.5, 0, .7, 1) infinite;
      }

      .${PLUGIN_ID}-fx-starwarp .${PLUGIN_ID}-scan {
        top: -40%;
        height: 180%;
        width: 88px;
        opacity: 0;
        background:
          linear-gradient(90deg, transparent, rgba(255,255,255,.58), color-mix(in srgb, var(--zut-accent, #77b7ff) 46%, transparent), transparent),
          radial-gradient(ellipse at 50% 50%, rgba(255,255,255,.42), transparent 60%);
        filter: blur(.32px);
        mix-blend-mode: screen;
      }

      .${PLUGIN_ID}-fx-starwarp .${PLUGIN_ID}-ring {
        inset: 0;
        border-color: color-mix(in srgb, var(--zut-accent, #77b7ff) 38%, transparent);
        box-shadow:
          0 0 0 1px color-mix(in srgb, var(--zut-accent, #77b7ff) 10%, transparent),
          inset 0 0 16px color-mix(in srgb, var(--zut-accent, #77b7ff) 12%, transparent);
      }

      .${PLUGIN_ID}-loading-starwarp {
        justify-content: center;
        flex-wrap: nowrap;
        white-space: nowrap;
      }

      .${PLUGIN_ID}-loading-starwarp .${PLUGIN_ID}-dot {
        display: none;
      }

      .${PLUGIN_ID}-loading-starwarp .${PLUGIN_ID}-loader {
        display: inline-block;
        width: 18px;
        height: 18px;
        flex: 0 0 18px;
        border-radius: 999px;
        overflow: visible;
        background:
          conic-gradient(from 0deg,
            transparent 0 16%,
            color-mix(in srgb, var(--zut-accent, #77b7ff) 88%, #fff) 30%,
            transparent 42% 66%,
            color-mix(in srgb, var(--zut-success-accent, #6ee7a8) 72%, #fff) 80%,
            transparent 94%);
        box-shadow:
          0 0 13px color-mix(in srgb, var(--zut-accent, #77b7ff) 60%, transparent),
          inset 0 0 6px rgba(255, 255, 255, .28);
        animation: zut-warp-core 1.4s linear infinite;
      }

      /* 外圈：放射状光轨向外冲刺 */
      .${PLUGIN_ID}-loading-starwarp .${PLUGIN_ID}-loader span:nth-child(1) {
        inset: -4px;
        border-radius: 999px;
        background:
          repeating-conic-gradient(from 0deg,
            transparent 0 13deg,
            color-mix(in srgb, var(--zut-accent, #77b7ff) 75%, #fff) 13deg 15deg,
            transparent 15deg 30deg);
        -webkit-mask-image: radial-gradient(circle, transparent 38%, #000 54%, transparent 82%);
                mask-image: radial-gradient(circle, transparent 38%, #000 54%, transparent 82%);
        opacity: .7;
        mix-blend-mode: screen;
        animation: zut-warp-core-rush 1.4s linear infinite;
      }

      /* 暗核：挖空中心形成环 */
      .${PLUGIN_ID}-loading-starwarp .${PLUGIN_ID}-loader span:nth-child(2) {
        inset: 4px;
        border-radius: 999px;
        background: radial-gradient(circle at 50% 50%, rgb(var(--zut-bg-rgb, 16 20 25) / .96), rgb(var(--zut-bg-rgb, 16 20 25) / .72));
        box-shadow: inset 0 0 4px rgba(0, 0, 0, .85);
      }

      /* 亮核：中央脉动的星点 */
      .${PLUGIN_ID}-loading-starwarp .${PLUGIN_ID}-loader span:nth-child(3) {
        inset: 6px;
        border-radius: 999px;
        background: radial-gradient(circle at 50% 50%, #fff, color-mix(in srgb, var(--zut-accent, #77b7ff) 82%, #fff) 58%, transparent 100%);
        animation: zut-warp-core-pulse 1.4s ease-in-out infinite;
      }

      @media (max-width: 520px) {
        .${PLUGIN_ID}-chip[data-zut-persistent="true"] {
          width: fit-content;
          min-width: min(242px, calc(100dvw - 18px));
          max-width: min(var(--zut-chip-max-width, 520px), calc(100dvw - 18px));
          flex-wrap: nowrap;
          white-space: nowrap;
        }

        .${PLUGIN_ID}-chip[data-zut-persistent="true"] .${PLUGIN_ID}-title {
          flex: 0 0 auto;
          max-width: 86px;
        }

        .${PLUGIN_ID}-chip[data-zut-persistent="true"] .${PLUGIN_ID}-text {
          flex: 1 1 auto;
          min-width: 0;
          max-width: none;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .${PLUGIN_ID}-chip[data-zut-persistent="true"] .${PLUGIN_ID}-action {
          flex: 0 0 auto;
          white-space: nowrap;
        }
      }

      .${PLUGIN_ID}-text {
        min-width: 0;
        flex: 1 1 auto;
        align-self: center;
        color: color-mix(in srgb, var(--zut-text-color, #eef6ff) 94%, transparent);
        white-space: normal;
        overflow-wrap: break-word;
        word-break: normal;
        line-break: strict;
        position: relative;
        z-index: 1;
      }

      .${PLUGIN_ID}-action {
        flex: 0 0 auto;
        align-self: center;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        margin-left: 2px;
        padding: var(--zut-button-pad-y, 2px) var(--zut-button-pad-x, 7px);
        border: 1px solid color-mix(in srgb, var(--zut-accent, #77b7ff) 58%, transparent);
        border-radius: 5px;
        background: rgba(255,255,255,0.06);
        color: var(--zut-text-color, #eef6ff);
        font: inherit;
        cursor: pointer;
        position: relative;
        z-index: 1;
      }

      .${PLUGIN_ID}-action:hover {
        background: color-mix(in srgb, var(--zut-accent, #77b7ff) 24%, transparent);
      }

      @media (max-width: 520px) {
        .${PLUGIN_ID}-chip {
          width: auto;
          min-width: 0;
          max-width: min(var(--zut-chip-max-width, 520px), calc(100dvw - 18px));
          justify-content: center;
        }

        .${PLUGIN_ID}-chip[data-zut-wide="true"] {
          width: min(var(--zut-chip-max-width, 520px), calc(100dvw - 18px));
        }

        .${PLUGIN_ID}-title {
          max-width: min(34vw, var(--zut-title-max-width, 120px));
        }

        .${PLUGIN_ID}-chip[data-zut-wide="true"] .${PLUGIN_ID}-title {
          max-width: min(30vw, var(--zut-title-max-width, 120px));
        }

        .${PLUGIN_ID}-text {
          flex: 1 1 auto;
        }

        .${PLUGIN_ID}-chip[data-zut-wide="true"] .${PLUGIN_ID}-text {
          flex-basis: 0;
        }
      }

      .${PLUGIN_ID}-success { --zut-accent: var(--zut-success-accent, #6ee7a8); }
      .${PLUGIN_ID}-info { --zut-accent: var(--zut-info-accent, #77b7ff); }
      .${PLUGIN_ID}-warning { --zut-accent: var(--zut-warning-accent, #ffd166); color: var(--zut-text-color, #eef6ff); }
      .${PLUGIN_ID}-error {
        --zut-accent: var(--zut-error-accent, #ff6b7a);
        border-color: color-mix(in srgb, var(--zut-error-accent, #ff6b7a) 58%, transparent);
        animation: zut-pop-in 680ms cubic-bezier(.16, 1, .3, 1) forwards, zut-error-pulse 920ms ease-in-out 220ms 2;
      }

      :root.${PLUGIN_ID}-immersive-on,
      :root.${PLUGIN_ID}-immersive-on body {
        width: 100dvw !important;
        height: 100dvh !important;
        max-width: 100dvw !important;
        max-height: 100dvh !important;
        overflow: hidden !important;
        overscroll-behavior: none !important;
      }

      :root.${PLUGIN_ID}-immersive-on #top-bar {
        opacity: 1 !important;
        pointer-events: auto !important;
        transform: none !important;
        z-index: 3005 !important;
      }

      :root.${PLUGIN_ID}-immersive-on #sheld {
        position: fixed !important;
        top: var(--topBarBlockSize) !important;
        left: 0 !important;
        right: 0 !important;
        bottom: 0 !important;
        width: 100dvw !important;
        min-width: 100dvw !important;
        max-width: 100dvw !important;
        height: calc(100dvh - var(--topBarBlockSize)) !important;
        min-height: calc(100dvh - var(--topBarBlockSize)) !important;
        max-height: calc(100dvh - var(--topBarBlockSize)) !important;
        margin: 0 !important;
        padding-left: max(env(safe-area-inset-left), 0px) !important;
        padding-right: max(env(safe-area-inset-right), 0px) !important;
        padding-bottom: max(env(safe-area-inset-bottom), 0px) !important;
        box-sizing: border-box !important;
        border-radius: 0 !important;
        z-index: auto !important;
      }

      :root.${PLUGIN_ID}-immersive-on #chat {
        flex: 1 1 auto !important;
        max-height: none !important;
        min-height: 0 !important;
      }

      :root.${PLUGIN_ID}-immersive-on #send_form {
        border-radius: 12px 12px 0 0 !important;
      }

      @media (display-mode: fullscreen), (display-mode: standalone) {
        :root.${PLUGIN_ID}-immersive-on #sheld {
          height: calc(100vh - var(--topBarBlockSize)) !important;
          height: calc(100dvh - var(--topBarBlockSize)) !important;
        }
      }

      #${SEND_DOCK_ID} {
        position: fixed;
        left: 50%;
        bottom: max(8px, env(safe-area-inset-bottom));
        z-index: 1000000;
        width: min(132px, 32vw);
        min-width: 86px;
        height: 18px;
        padding: 0;
        border: 1px solid color-mix(in srgb, var(--zut-info-accent, #77b7ff) 42%, transparent);
        border-radius: 999px;
        background:
          linear-gradient(90deg, transparent, color-mix(in srgb, var(--zut-info-accent, #77b7ff) 34%, transparent), transparent),
          rgb(var(--zut-bg-rgb, 16 20 25) / .72);
        box-shadow:
          0 10px 26px rgba(0,0,0,.34),
          0 0 18px color-mix(in srgb, var(--zut-info-accent, #77b7ff) 24%, transparent),
          inset 0 1px 0 rgba(255,255,255,.18);
        backdrop-filter: blur(10px) saturate(1.12);
        -webkit-backdrop-filter: blur(10px) saturate(1.12);
        color: transparent;
        cursor: pointer;
        opacity: 0;
        pointer-events: none;
        transform: translate3d(-50%, 18px, 0) scale(.86);
        transition:
          opacity 260ms ease,
          transform 360ms cubic-bezier(.22, 1, .36, 1),
          width 260ms ease,
          box-shadow 220ms ease;
      }

      #${SEND_DOCK_ID}::before {
        content: "";
        position: absolute;
        left: 14px;
        right: 14px;
        top: 50%;
        height: 3px;
        border-radius: 999px;
        background: color-mix(in srgb, var(--zut-text-color, #eef6ff) 72%, transparent);
        transform: translateY(-50%);
        box-shadow: 0 0 10px color-mix(in srgb, var(--zut-info-accent, #77b7ff) 42%, transparent);
      }

      #${SEND_DOCK_ID}:hover {
        width: min(156px, 40vw);
        box-shadow:
          0 12px 30px rgba(0,0,0,.38),
          0 0 24px color-mix(in srgb, var(--zut-info-accent, #77b7ff) 38%, transparent),
          inset 0 1px 0 rgba(255,255,255,.22);
      }

      :root.${PLUGIN_ID}-input-dock-on #sheld {
        overflow: hidden !important;
      }

      :root.${PLUGIN_ID}-input-dock-on #chat {
        flex: 1 1 auto !important;
        max-height: none !important;
        min-height: 0 !important;
        scrollbar-gutter: stable;
        border-bottom-color: color-mix(in srgb, var(--zut-info-accent, #77b7ff) 26%, var(--SmartThemeBorderColor, rgba(80,80,80,.89))) !important;
        box-shadow:
          inset 0 -1px 0 color-mix(in srgb, var(--zut-info-accent, #77b7ff) 24%, transparent),
          inset 0 -16px 22px rgba(0, 0, 0, .10);
      }

      :root.${PLUGIN_ID}-input-dock-on #form_sheld {
        position: absolute !important;
        left: 0;
        right: 0;
        bottom: 0;
        width: 100%;
        height: auto !important;
        min-height: 0 !important;
        max-height: none !important;
        margin: 0 !important;
        z-index: 120;
        overflow: visible !important;
        pointer-events: none;
      }

      :root.${PLUGIN_ID}-input-dock-on #dialogue_del_mes {
        pointer-events: auto;
      }

      :root.${PLUGIN_ID}-input-dock-on #send_form {
        pointer-events: auto;
        transform-origin: 50% 100%;
        will-change: transform, opacity;
        transition:
          opacity 320ms ease,
          transform 420ms cubic-bezier(.22, 1, .36, 1),
          border-color 220ms ease,
          box-shadow 220ms ease;
      }

      :root.${PLUGIN_ID}-input-dock-collapsed #form_sheld {
        pointer-events: none;
      }

      :root.${PLUGIN_ID}-input-dock-collapsed #send_form {
        border-color: color-mix(in srgb, var(--zut-info-accent, #77b7ff) 18%, transparent) !important;
        opacity: 0 !important;
        pointer-events: none !important;
        transform: translate3d(0, calc(100% + 18px), 0) scale(.97);
        box-shadow: none;
      }

      :root.${PLUGIN_ID}-input-dock-collapsed #${SEND_DOCK_ID} {
        opacity: 1;
        pointer-events: auto;
        transform: translate3d(-50%, 0, 0) scale(1);
      }

      :root.${PLUGIN_ID}-input-dock-expanded #send_form {
        opacity: 1;
        transform: translate3d(0, 0, 0) scale(1);
        box-shadow:
          0 -12px 24px rgba(0,0,0,.18),
          0 0 18px color-mix(in srgb, var(--zut-info-accent, #77b7ff) 14%, transparent);
      }

      @media (max-width: 520px) {
        #${SEND_DOCK_ID} {
          width: min(118px, 38vw);
          min-width: 72px;
          height: 17px;
          bottom: max(7px, env(safe-area-inset-bottom));
        }

        #${SEND_DOCK_ID}:hover {
          width: min(132px, 46vw);
        }

      }

      #${EDGE_DOCK_ID} {
        position: fixed;
        z-index: 999996;
        pointer-events: none;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      #${EDGE_DOCK_ID}.${PLUGIN_ID}-edge-dock--right {
        flex-direction: row-reverse;
      }

      #${EDGE_DOCK_ID}.${PLUGIN_ID}-edge-dock--left {
        flex-direction: row;
      }

      #${EDGE_DOCK_ID}.${PLUGIN_ID}-edge-dock--top {
        flex-direction: column;
      }

      #${EDGE_DOCK_ID}.${PLUGIN_ID}-edge-dock--bottom {
        flex-direction: column-reverse;
      }

      .${PLUGIN_ID}-dock-handle,
      .${PLUGIN_ID}-dock-panel,
      .${PLUGIN_ID}-dock-item,
      .${PLUGIN_ID}-dock-tool {
        pointer-events: auto;
      }

      .${PLUGIN_ID}-dock-handle {
        width: 18px;
        height: 72px;
        border: 1px solid color-mix(in srgb, var(--zut-info-accent, #77b7ff) 32%, transparent);
        border-radius: 999px;
        background:
          linear-gradient(180deg, rgba(255,255,255,.18), transparent 32%),
          rgb(var(--zut-bg-rgb, 16 20 25) / .78);
        box-shadow:
          0 10px 24px rgba(0,0,0,.34),
          0 0 18px color-mix(in srgb, var(--zut-info-accent, #77b7ff) 18%, transparent);
        color: var(--zut-text-color, #eef6ff);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        touch-action: none;
        backdrop-filter: blur(12px) saturate(1.06);
        -webkit-backdrop-filter: blur(12px) saturate(1.06);
        transition: transform 260ms cubic-bezier(.22, 1, .36, 1), box-shadow 220ms ease, opacity 220ms ease;
      }

      .${PLUGIN_ID}-dock-handle:hover {
        transform: scale(1.04);
        box-shadow:
          0 12px 28px rgba(0,0,0,.38),
          0 0 22px color-mix(in srgb, var(--zut-info-accent, #77b7ff) 30%, transparent);
      }

      #${EDGE_DOCK_ID}.is-adjusting .${PLUGIN_ID}-dock-handle {
        box-shadow:
          0 12px 28px rgba(0,0,0,.38),
          0 0 0 1px color-mix(in srgb, var(--zut-warning-accent, #ffd166) 52%, transparent),
          0 0 24px color-mix(in srgb, var(--zut-warning-accent, #ffd166) 36%, transparent);
      }

      #${EDGE_DOCK_ID}.${PLUGIN_ID}-edge-dock--top .${PLUGIN_ID}-dock-handle,
      #${EDGE_DOCK_ID}.${PLUGIN_ID}-edge-dock--bottom .${PLUGIN_ID}-dock-handle {
        width: 72px;
        height: 18px;
      }

      .${PLUGIN_ID}-dock-count {
        width: 6px;
        height: 6px;
        border-radius: 999px;
        background: transparent;
        box-shadow: none;
        transition: background 180ms ease, box-shadow 180ms ease, transform 180ms ease;
      }

      #${EDGE_DOCK_ID}.has-items .${PLUGIN_ID}-dock-count {
        background: color-mix(in srgb, var(--zut-info-accent, #77b7ff) 92%, white);
        box-shadow: 0 0 10px color-mix(in srgb, var(--zut-info-accent, #77b7ff) 58%, transparent);
        transform: scale(1);
      }

      .${PLUGIN_ID}-dock-panel {
        display: flex;
        gap: 8px;
        padding: 8px;
        margin: 0 8px;
        border: 1px solid color-mix(in srgb, var(--zut-info-accent, #77b7ff) 28%, transparent);
        border-radius: 14px;
        background:
          linear-gradient(135deg, rgba(255,255,255,.12), transparent 42%),
          rgb(var(--zut-bg-rgb, 16 20 25) / .82);
        box-shadow:
          0 16px 36px rgba(0,0,0,.36),
          0 0 22px color-mix(in srgb, var(--zut-info-accent, #77b7ff) 16%, transparent);
        backdrop-filter: blur(14px) saturate(1.08);
        -webkit-backdrop-filter: blur(14px) saturate(1.08);
        opacity: 0;
        transform: scale(.94);
        transform-origin: center;
        pointer-events: none;
        transition: opacity 220ms ease, transform 280ms cubic-bezier(.22, 1, .36, 1);
      }

      #${EDGE_DOCK_ID}.is-open .${PLUGIN_ID}-dock-panel {
        opacity: 1;
        transform: scale(1);
        pointer-events: auto;
      }

      #${EDGE_DOCK_ID}.${PLUGIN_ID}-edge-dock--left .${PLUGIN_ID}-dock-panel,
      #${EDGE_DOCK_ID}.${PLUGIN_ID}-edge-dock--right .${PLUGIN_ID}-dock-panel {
        flex-direction: column;
      }

      #${EDGE_DOCK_ID}.${PLUGIN_ID}-edge-dock--top .${PLUGIN_ID}-dock-panel,
      #${EDGE_DOCK_ID}.${PLUGIN_ID}-edge-dock--bottom .${PLUGIN_ID}-dock-panel {
        flex-direction: row;
        align-items: center;
      }

      .${PLUGIN_ID}-dock-stack {
        display: flex;
        flex-direction: column;
        gap: 10px;
        align-items: flex-end;
      }

      #${EDGE_DOCK_ID}.${PLUGIN_ID}-edge-dock--left .${PLUGIN_ID}-dock-stack {
        align-items: flex-start;
      }

      #${EDGE_DOCK_ID}.${PLUGIN_ID}-edge-dock--top .${PLUGIN_ID}-dock-stack,
      #${EDGE_DOCK_ID}.${PLUGIN_ID}-edge-dock--bottom .${PLUGIN_ID}-dock-stack {
        align-items: center;
      }

      .${PLUGIN_ID}-dock-preset-panel,
      .${PLUGIN_ID}-dock-items-panel {
        width: max-content;
        max-width: 188px;
      }

      .${PLUGIN_ID}-dock-items-panel {
        align-self: flex-end;
      }

      #${EDGE_DOCK_ID}.${PLUGIN_ID}-edge-dock--left .${PLUGIN_ID}-dock-items-panel {
        align-self: flex-start;
      }

      #${EDGE_DOCK_ID}.${PLUGIN_ID}-edge-dock--top .${PLUGIN_ID}-dock-items-panel,
      #${EDGE_DOCK_ID}.${PLUGIN_ID}-edge-dock--bottom .${PLUGIN_ID}-dock-items-panel {
        align-self: center;
      }

      .${PLUGIN_ID}-dock-preset-panel {
        flex-direction: column !important;
        gap: 6px;
        max-width: 188px;
      }

      .${PLUGIN_ID}-dock-preset-panel.is-empty {
        display: none !important;
      }

      .${PLUGIN_ID}-dock-items-panel {
        padding: 5px;
        gap: 5px;
      }

      #${EDGE_DOCK_ID}:not(.has-items) .${PLUGIN_ID}-dock-items-panel {
        display: none !important;
      }

      .${PLUGIN_ID}-dock-presets-title {
        font-size: 10px;
        opacity: .6;
        letter-spacing: .04em;
        color: var(--zut-text-color, #eef6ff);
      }

      .${PLUGIN_ID}-dock-preset {
        display: flex;
        align-items: center;
        gap: 6px;
        max-width: 100%;
        padding: 4px 9px;
        border-radius: 9px;
        border: 1px solid color-mix(in srgb, var(--zut-info-accent, #77b7ff) 22%, transparent);
        background: rgb(var(--zut-bg-rgb, 16 20 25) / .55);
        color: var(--zut-text-color, #eef6ff);
        font-size: 11px;
        line-height: 1.2;
        cursor: pointer;
        transition: border-color 160ms ease, background 160ms ease, transform 160ms ease;
      }

      .${PLUGIN_ID}-dock-preset:hover {
        border-color: color-mix(in srgb, var(--zut-info-accent, #77b7ff) 55%, transparent);
        transform: translateY(-1px);
      }

      .${PLUGIN_ID}-dock-preset.is-active {
        border-color: var(--zut-info-accent, #77b7ff);
        background: color-mix(in srgb, var(--zut-info-accent, #77b7ff) 24%, rgb(var(--zut-bg-rgb, 16 20 25) / .6));
      }

      .${PLUGIN_ID}-dock-preset-dot {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        flex-shrink: 0;
        box-shadow: 0 0 0 1px rgba(255,255,255,.25) inset;
      }

      .${PLUGIN_ID}-dock-preset-label {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .${PLUGIN_ID}-dock-actions,
      .${PLUGIN_ID}-dock-list {
        display: flex;
        gap: 5px;
      }

      .${PLUGIN_ID}-dock-actions {
        flex-shrink: 0;
      }

      #${EDGE_DOCK_ID}.${PLUGIN_ID}-edge-dock--left .${PLUGIN_ID}-dock-actions,
      #${EDGE_DOCK_ID}.${PLUGIN_ID}-edge-dock--right .${PLUGIN_ID}-dock-actions,
      #${EDGE_DOCK_ID}.${PLUGIN_ID}-edge-dock--left .${PLUGIN_ID}-dock-list,
      #${EDGE_DOCK_ID}.${PLUGIN_ID}-edge-dock--right .${PLUGIN_ID}-dock-list {
        flex-direction: column;
      }

      .${PLUGIN_ID}-dock-tool,
      .${PLUGIN_ID}-dock-item {
        width: 28px;
        height: 28px;
        border: 1px solid rgba(255,255,255,.12);
        border-radius: 9px;
        background: rgba(255,255,255,.06);
        color: var(--zut-text-color, #eef6ff);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        user-select: none;
        -webkit-user-select: none;
        touch-action: none;
        transition: transform 180ms ease, border-color 180ms ease, background 180ms ease, opacity 180ms ease;
      }

      .${PLUGIN_ID}-dock-item,
      .${PLUGIN_ID}-dock-item * {
        pointer-events: auto;
      }

      .${PLUGIN_ID}-dock-tool:hover,
      .${PLUGIN_ID}-dock-item:hover {
        transform: translateY(-1px) scale(1.03);
        border-color: color-mix(in srgb, var(--zut-info-accent, #77b7ff) 54%, transparent);
        background: rgba(255,255,255,.12);
      }

      .${PLUGIN_ID}-dock-tool.is-active {
        border-color: color-mix(in srgb, var(--zut-success-accent, #6ee7a8) 68%, transparent);
        box-shadow: 0 0 0 1px color-mix(in srgb, var(--zut-success-accent, #6ee7a8) 42%, transparent);
      }

      .${PLUGIN_ID}-dock-item.is-missing {
        opacity: .42;
        filter: grayscale(.2);
      }

      .${PLUGIN_ID}-dock-item.has-live-element {
        opacity: .24;
      }

      .${PLUGIN_ID}-dock-item span {
        font: 700 12px/1 var(--mainFontFamily, "Noto Sans SC", sans-serif);
      }

      #ci-island-container.${PLUGIN_ID}-ci-island-edge {
        transition:
          width 220ms cubic-bezier(.22, 1, .36, 1),
          padding 220ms cubic-bezier(.22, 1, .36, 1),
          border-radius 220ms cubic-bezier(.22, 1, .36, 1),
          box-shadow 220ms ease,
          background 220ms ease !important;
        overflow: hidden !important;
      }

      #ci-island-container.${PLUGIN_ID}-ci-island-edge::before {
        content: "";
        position: absolute;
        inset: 10px 4px;
        border-radius: 999px;
        background:
          linear-gradient(180deg,
            color-mix(in srgb, var(--zut-info-accent, #77b7ff) 90%, white),
            color-mix(in srgb, var(--zut-info-accent, #77b7ff) 48%, transparent));
        box-shadow:
          0 0 12px color-mix(in srgb, var(--zut-info-accent, #77b7ff) 42%, transparent),
          0 0 0 1px color-mix(in srgb, var(--zut-info-accent, #77b7ff) 20%, transparent);
        opacity: 0;
        transform: scaleY(.76);
        transition: opacity 180ms ease, transform 180ms ease;
        pointer-events: none;
      }

      #ci-island-container.${PLUGIN_ID}-ci-island-edge.${PLUGIN_ID}-ci-island-collapsed {
        width: 16px !important;
        min-width: 16px !important;
        padding: 8px 0 !important;
        gap: 0 !important;
        cursor: pointer !important;
        background:
          linear-gradient(180deg, rgba(255,255,255,.18), transparent 40%),
          rgb(var(--zut-bg-rgb, 16 20 25) / .84) !important;
        box-shadow:
          0 10px 24px rgba(0,0,0,.32),
          0 0 18px color-mix(in srgb, var(--zut-info-accent, #77b7ff) 18%, transparent) !important;
      }

      #ci-island-container.${PLUGIN_ID}-ci-island-edge.${PLUGIN_ID}-ci-island-collapsed.${PLUGIN_ID}-ci-island-left {
        border-radius: 0 12px 12px 0 !important;
      }

      #ci-island-container.${PLUGIN_ID}-ci-island-edge.${PLUGIN_ID}-ci-island-collapsed.${PLUGIN_ID}-ci-island-right {
        border-radius: 12px 0 0 12px !important;
      }

      #ci-island-container.${PLUGIN_ID}-ci-island-edge.${PLUGIN_ID}-ci-island-collapsed::before {
        opacity: 1;
        transform: scaleY(1);
      }

      #ci-island-container.${PLUGIN_ID}-ci-island-edge.${PLUGIN_ID}-ci-island-collapsed > * {
        opacity: 0 !important;
        transform: scale(.84);
        pointer-events: none !important;
        transition: opacity 140ms ease, transform 180ms ease;
      }

      #ci-island-container.${PLUGIN_ID}-ci-island-edge.${PLUGIN_ID}-ci-island-expanded {
        width: 44px !important;
        min-width: 44px !important;
      }

      #ci-island-container.${PLUGIN_ID}-ci-island-edge.${PLUGIN_ID}-ci-island-expanded > * {
        opacity: 1 !important;
        transform: scale(1);
        pointer-events: auto !important;
        transition: opacity 180ms ease 40ms, transform 220ms cubic-bezier(.22, 1, .36, 1);
      }

      :root.${PLUGIN_ID}-ci-island-collapsed .ci-options-container {
        opacity: 0 !important;
        pointer-events: none !important;
      }

      #${EDGE_DOCK_CAPTURE_ID} {
        position: fixed;
        inset: 0;
        z-index: 999997;
        background: rgba(8, 10, 14, .28);
        cursor: crosshair;
        pointer-events: none;
      }

      .${PLUGIN_ID}-dock-capture-card {
        position: absolute;
        top: max(16px, env(safe-area-inset-top));
        left: 50%;
        transform: translateX(-50%);
        min-width: min(86vw, 280px);
        max-width: min(92vw, 360px);
        padding: 12px 16px;
        border: 1px solid color-mix(in srgb, var(--zut-warning-accent, #ffd166) 38%, transparent);
        border-radius: 14px;
        background:
          linear-gradient(135deg, rgba(255,255,255,.12), transparent 46%),
          rgb(var(--zut-bg-rgb, 16 20 25) / .92);
        color: var(--zut-text-color, #eef6ff);
        box-shadow: 0 16px 38px rgba(0,0,0,.34);
        backdrop-filter: blur(12px) saturate(1.04);
        -webkit-backdrop-filter: blur(12px) saturate(1.04);
        pointer-events: none;
      }

      .${PLUGIN_ID}-dock-capture-title {
        font: 700 13px/1.2 var(--mainFontFamily, "Noto Sans SC", sans-serif);
        color: color-mix(in srgb, var(--zut-warning-accent, #ffd166) 84%, white);
      }

      .${PLUGIN_ID}-dock-capture-text {
        margin-top: 5px;
        font: 12px/1.45 var(--mainFontFamily, "Noto Sans SC", sans-serif);
        opacity: .92;
      }

      @media (max-width: 520px) {
        .${PLUGIN_ID}-dock-handle {
          width: 16px;
          height: 62px;
        }

        #${EDGE_DOCK_ID}.${PLUGIN_ID}-edge-dock--top .${PLUGIN_ID}-dock-handle,
        #${EDGE_DOCK_ID}.${PLUGIN_ID}-edge-dock--bottom .${PLUGIN_ID}-dock-handle {
          width: 62px;
          height: 16px;
        }

        .${PLUGIN_ID}-dock-panel {
          gap: 6px;
          padding: 7px;
          margin: 0 6px;
        }

        .${PLUGIN_ID}-dock-tool,
        .${PLUGIN_ID}-dock-item {
          width: 31px;
          height: 31px;
        }
      }

      .${PLUGIN_ID}-settings .inline-drawer-content {
        padding: 0.75rem;
      }

      .${PLUGIN_ID}-settings .${PLUGIN_ID}-settings-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
        gap: 0.65rem 0.75rem;
      }

      .${PLUGIN_ID}-settings label {
        display: flex;
        flex-direction: column;
        gap: 6px;
        font-size: 12px;
        color: inherit;
        writing-mode: horizontal-tb !important;
        text-orientation: mixed !important;
      }

      .${PLUGIN_ID}-settings input[type="color"],
      .${PLUGIN_ID}-settings input[type="number"],
      .${PLUGIN_ID}-settings input[type="range"],
      .${PLUGIN_ID}-settings select {
        width: 100%;
      }

      .${PLUGIN_ID}-settings input[type="range"] {
        accent-color: var(--zut-info-accent, #77b7ff);
      }

      .${PLUGIN_ID}-settings .${PLUGIN_ID}-number-stepper {
        display: grid;
        grid-template-columns: 36px minmax(0, 1fr) 36px;
        gap: 6px;
        align-items: stretch;
      }

      .${PLUGIN_ID}-settings .${PLUGIN_ID}-number-stepper input[type="number"] {
        min-width: 0;
        text-align: center;
        font-variant-numeric: tabular-nums;
      }

      .${PLUGIN_ID}-settings .${PLUGIN_ID}-stepper-button {
        min-width: 36px !important;
        height: 34px !important;
        padding: 0 !important;
        border-radius: 7px !important;
        display: inline-flex !important;
        align-items: center;
        justify-content: center;
        font: 800 17px/1 var(--mainFontFamily, "Noto Sans SC", sans-serif);
        color: var(--zut-text-color, #eef6ff);
        background: color-mix(in srgb, var(--zut-info-accent, #77b7ff) 18%, rgba(255,255,255,0.08));
        border: 1px solid color-mix(in srgb, var(--zut-info-accent, #77b7ff) 30%, rgba(255,255,255,0.12));
        cursor: pointer;
        touch-action: manipulation;
        user-select: none;
      }

      .${PLUGIN_ID}-settings .${PLUGIN_ID}-stepper-button:hover {
        background: color-mix(in srgb, var(--zut-info-accent, #77b7ff) 28%, rgba(255,255,255,0.12));
      }

      .${PLUGIN_ID}-settings .${PLUGIN_ID}-stepper-button:active {
        transform: translateY(1px) scale(.98);
      }

      .${PLUGIN_ID}-settings input[type="checkbox"],
      .${PLUGIN_ID}-settings input[type="radio"],
      :root.${PLUGIN_ID}-popup-on .popup input[type="checkbox"],
      :root.${PLUGIN_ID}-popup-on .popup input[type="radio"],
      :root.${PLUGIN_ID}-popup-on #dialogue_popup input[type="checkbox"],
      :root.${PLUGIN_ID}-popup-on #dialogue_popup input[type="radio"] {
        -webkit-appearance: none;
        appearance: none;
        width: 16px;
        height: 16px;
        margin: 0;
        flex: 0 0 auto;
        display: inline-grid;
        place-content: center;
        background: rgb(var(--zut-bg-rgb, 16 20 25) / 0.82);
        border: 1px solid color-mix(in srgb, var(--zut-info-accent, #77b7ff) 28%, rgba(255,255,255,0.16));
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.07);
        cursor: pointer;
        transition:
          background-color 160ms ease,
          border-color 160ms ease,
          box-shadow 160ms ease,
          transform 120ms ease;
      }

      .${PLUGIN_ID}-settings input[type="checkbox"] {
        border-radius: 4px;
      }

      .${PLUGIN_ID}-settings input[type="radio"] {
        border-radius: 999px;
      }

      .${PLUGIN_ID}-settings input[type="checkbox"]::before,
      .${PLUGIN_ID}-settings input[type="radio"]::before,
      :root.${PLUGIN_ID}-popup-on .popup input[type="checkbox"]::before,
      :root.${PLUGIN_ID}-popup-on .popup input[type="radio"]::before,
      :root.${PLUGIN_ID}-popup-on #dialogue_popup input[type="checkbox"]::before,
      :root.${PLUGIN_ID}-popup-on #dialogue_popup input[type="radio"]::before {
        content: "";
        display: block;
        transform-origin: center;
        transition: transform 140ms ease;
      }

      .${PLUGIN_ID}-settings input[type="checkbox"]::before,
      :root.${PLUGIN_ID}-popup-on .popup input[type="checkbox"]::before,
      :root.${PLUGIN_ID}-popup-on #dialogue_popup input[type="checkbox"]::before {
        width: 8px;
        height: 5px;
        margin-top: -1px;
        border: solid var(--zut-checkbox-tick-color, #ffffff);
        border-width: 0 0 2px 2px;
        transform: rotate(-45deg) scale(0);
      }

      .${PLUGIN_ID}-settings input[type="radio"]::before,
      :root.${PLUGIN_ID}-popup-on .popup input[type="radio"]::before,
      :root.${PLUGIN_ID}-popup-on #dialogue_popup input[type="radio"]::before {
        width: 8px;
        height: 8px;
        border-radius: 999px;
        background: var(--zut-checkbox-tick-color, #ffffff);
        transform: scale(0);
      }

      .${PLUGIN_ID}-settings input[type="checkbox"]:checked,
      .${PLUGIN_ID}-settings input[type="radio"]:checked,
      :root.${PLUGIN_ID}-popup-on .popup input[type="checkbox"]:checked,
      :root.${PLUGIN_ID}-popup-on .popup input[type="radio"]:checked,
      :root.${PLUGIN_ID}-popup-on #dialogue_popup input[type="checkbox"]:checked,
      :root.${PLUGIN_ID}-popup-on #dialogue_popup input[type="radio"]:checked {
        background: color-mix(in srgb, var(--zut-info-accent, #77b7ff) 88%, transparent);
        border-color: color-mix(in srgb, var(--zut-info-accent, #77b7ff) 72%, transparent);
        box-shadow:
          0 0 0 1px color-mix(in srgb, var(--zut-info-accent, #77b7ff) 18%, transparent),
          0 0 10px color-mix(in srgb, var(--zut-info-accent, #77b7ff) 22%, transparent);
      }

      .${PLUGIN_ID}-settings input[type="checkbox"]:checked::before,
      :root.${PLUGIN_ID}-popup-on .popup input[type="checkbox"]:checked::before,
      :root.${PLUGIN_ID}-popup-on #dialogue_popup input[type="checkbox"]:checked::before {
        transform: rotate(-45deg) scale(1);
      }

      .${PLUGIN_ID}-settings input[type="radio"]:checked::before,
      :root.${PLUGIN_ID}-popup-on .popup input[type="radio"]:checked::before,
      :root.${PLUGIN_ID}-popup-on #dialogue_popup input[type="radio"]:checked::before {
        transform: scale(1);
      }

      .${PLUGIN_ID}-settings input[type="checkbox"]:focus-visible,
      .${PLUGIN_ID}-settings input[type="radio"]:focus-visible,
      :root.${PLUGIN_ID}-popup-on .popup input[type="checkbox"]:focus-visible,
      :root.${PLUGIN_ID}-popup-on .popup input[type="radio"]:focus-visible,
      :root.${PLUGIN_ID}-popup-on #dialogue_popup input[type="checkbox"]:focus-visible,
      :root.${PLUGIN_ID}-popup-on #dialogue_popup input[type="radio"]:focus-visible {
        outline: 2px solid color-mix(in srgb, var(--zut-info-accent, #77b7ff) 62%, white);
        outline-offset: 2px;
      }

      .${PLUGIN_ID}-settings input[type="checkbox"]:disabled,
      .${PLUGIN_ID}-settings input[type="radio"]:disabled,
      :root.${PLUGIN_ID}-popup-on .popup input[type="checkbox"]:disabled,
      :root.${PLUGIN_ID}-popup-on .popup input[type="radio"]:disabled,
      :root.${PLUGIN_ID}-popup-on #dialogue_popup input[type="checkbox"]:disabled,
      :root.${PLUGIN_ID}-popup-on #dialogue_popup input[type="radio"]:disabled {
        cursor: not-allowed;
        opacity: 0.62;
      }

      .${PLUGIN_ID}-settings input[type="color"] {
        height: 34px;
        padding: 2px;
      }

      .${PLUGIN_ID}-settings .${PLUGIN_ID}-switch-row {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
        margin-bottom: 0.75rem;
      }

      .${PLUGIN_ID}-settings .${PLUGIN_ID}-switch-row label {
        width: auto;
        min-width: max-content;
        flex-direction: row;
        align-items: center;
        white-space: nowrap;
      }

      .${PLUGIN_ID}-settings .${PLUGIN_ID}-switch-row input {
        width: auto;
        margin: 0;
      }

      .${PLUGIN_ID}-settings .${PLUGIN_ID}-slider-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }

      .${PLUGIN_ID}-settings .${PLUGIN_ID}-slider-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(130px, 0.62fr);
        gap: 8px;
        align-items: center;
      }

      .${PLUGIN_ID}-settings .${PLUGIN_ID}-slider-value {
        font-size: 11px;
        font-weight: 700;
        color: color-mix(in srgb, var(--zut-info-accent, #77b7ff) 74%, white);
        font-variant-numeric: tabular-nums;
      }

      .${PLUGIN_ID}-settings .${PLUGIN_ID}-settings-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        margin-top: 0.85rem;
        flex-wrap: wrap;
      }

      .${PLUGIN_ID}-settings .${PLUGIN_ID}-settings-note {
        margin-top: 0.65rem;
        font-size: 12px;
        opacity: .78;
      }

      .${PLUGIN_ID}-settings .${PLUGIN_ID}-preset-block {
        margin-top: 0.85rem;
        padding-top: 0.75rem;
        border-top: 1px solid color-mix(in srgb, var(--zut-info-accent, #77b7ff) 20%, transparent);
      }

      .${PLUGIN_ID}-settings .${PLUGIN_ID}-preset-head {
        font-size: 13px;
        font-weight: 600;
        margin-bottom: 0.5rem;
      }

      .${PLUGIN_ID}-settings .${PLUGIN_ID}-preset-save-row {
        display: flex;
        gap: 8px;
        align-items: center;
        margin-bottom: 0.6rem;
        flex-wrap: wrap;
      }

      .${PLUGIN_ID}-settings .${PLUGIN_ID}-preset-name {
        flex: 1 1 120px;
        min-width: 120px;
      }

      .${PLUGIN_ID}-settings .${PLUGIN_ID}-preset-save-row .menu_button {
        width: auto !important;
        min-width: max-content;
        white-space: nowrap !important;
        writing-mode: horizontal-tb !important;
      }

      .${PLUGIN_ID}-settings .${PLUGIN_ID}-preset-list {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .${PLUGIN_ID}-settings .${PLUGIN_ID}-preset-empty {
        font-size: 12px;
        opacity: .6;
      }

      .${PLUGIN_ID}-settings .${PLUGIN_ID}-preset-item {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 4px;
        border-radius: 10px;
        border: 1px solid color-mix(in srgb, var(--zut-info-accent, #77b7ff) 16%, transparent);
        background: rgb(var(--zut-bg-rgb, 16 20 25) / .35);
      }

      .${PLUGIN_ID}-settings .${PLUGIN_ID}-preset-item.is-active {
        border-color: var(--zut-info-accent, #77b7ff);
        box-shadow: 0 0 0 1px color-mix(in srgb, var(--zut-info-accent, #77b7ff) 45%, transparent) inset;
      }

      .${PLUGIN_ID}-settings .${PLUGIN_ID}-preset-apply {
        flex: 1 1 auto;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 4px 8px;
        border: none;
        border-radius: 8px;
        background: transparent;
        color: var(--zut-text-color, #eef6ff);
        cursor: pointer;
        font-size: 12px;
        text-align: left;
        min-width: 0;
      }

      .${PLUGIN_ID}-settings .${PLUGIN_ID}-preset-apply:hover {
        background: rgb(var(--zut-bg-rgb, 16 20 25) / .6);
      }

      .${PLUGIN_ID}-settings .${PLUGIN_ID}-preset-swatches {
        display: inline-flex;
        gap: 3px;
        flex-shrink: 0;
      }

      .${PLUGIN_ID}-settings .${PLUGIN_ID}-preset-swatch {
        width: 12px;
        height: 12px;
        border-radius: 3px;
        box-shadow: 0 0 0 1px rgba(255,255,255,.2) inset;
      }

      .${PLUGIN_ID}-settings .${PLUGIN_ID}-preset-label {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .${PLUGIN_ID}-settings .${PLUGIN_ID}-preset-delete {
        flex-shrink: 0;
        width: 24px;
        height: 24px;
        border-radius: 7px;
        border: none;
        background: transparent;
        color: var(--zut-text-color, #eef6ff);
        opacity: .55;
        font-size: 16px;
        line-height: 1;
        cursor: pointer;
        transition: opacity 140ms ease, background 140ms ease;
      }

      .${PLUGIN_ID}-settings .${PLUGIN_ID}-preset-delete:hover {
        opacity: 1;
        background: color-mix(in srgb, var(--zut-error-accent, #ff6b7a) 30%, transparent);
      }

      .${PLUGIN_ID}-settings .${PLUGIN_ID}-settings-actions .menu_button {
        width: auto !important;
        min-width: max-content;
        display: inline-flex !important;
        align-items: center;
        justify-content: center;
        white-space: nowrap !important;
        writing-mode: horizontal-tb !important;
        text-orientation: mixed !important;
      }

      @media (max-width: 520px) {
        .${PLUGIN_ID}-settings .${PLUGIN_ID}-settings-grid {
          grid-template-columns: 1fr;
        }

        .${PLUGIN_ID}-settings .${PLUGIN_ID}-number-stepper {
          grid-template-columns: 40px minmax(0, 1fr) 40px;
        }

        .${PLUGIN_ID}-settings .${PLUGIN_ID}-stepper-button {
          min-width: 40px !important;
          height: 38px !important;
        }

        .${PLUGIN_ID}-settings .${PLUGIN_ID}-slider-row {
          grid-template-columns: 1fr;
        }

        .${PLUGIN_ID}-settings .${PLUGIN_ID}-slider-row input[type="range"] {
          display: none;
        }

        .${PLUGIN_ID}-settings .${PLUGIN_ID}-slider-row .${PLUGIN_ID}-number-stepper {
          grid-column: 1 / -1;
        }
      }

      :root.${PLUGIN_ID}-popup-on .popup,
      :root.${PLUGIN_ID}-popup-on #dialogue_popup,
      :root.${PLUGIN_ID}-popup-on .dialogue_popup,
      :root.${PLUGIN_ID}-popup-on .modal,
      :root.${PLUGIN_ID}-popup-on .swal2-popup,
      :root.${PLUGIN_ID}-popup-on .ui-dialog,
      :root.${PLUGIN_ID}-popup-on .completion_prompt_manager_popup {
        color: var(--zut-text-color, #eef6ff) !important;
        background:
          linear-gradient(115deg, rgba(255,255,255,0.10), transparent 38%),
          rgb(var(--zut-bg-rgb, 16 20 25) / 0.94) !important;
        border: 1px solid color-mix(in srgb, var(--zut-info-accent, #77b7ff) 36%, transparent) !important;
        border-radius: 12px !important;
        box-shadow:
          0 18px 46px rgba(0,0,0,.44),
          0 0 24px color-mix(in srgb, var(--zut-info-accent, #77b7ff) 18%, transparent) !important;
        backdrop-filter: blur(10px) saturate(1.12) !important;
        -webkit-backdrop-filter: blur(10px) saturate(1.12) !important;
      }

      :root.${PLUGIN_ID}-popup-on .popup input,
      :root.${PLUGIN_ID}-popup-on .popup textarea,
      :root.${PLUGIN_ID}-popup-on .popup select,
      :root.${PLUGIN_ID}-popup-on #dialogue_popup input,
      :root.${PLUGIN_ID}-popup-on #dialogue_popup textarea,
      :root.${PLUGIN_ID}-popup-on #dialogue_popup select {
        color: var(--zut-text-color, #eef6ff) !important;
        background: rgb(var(--zut-bg-rgb, 16 20 25) / 0.72) !important;
        border: 1px solid color-mix(in srgb, var(--zut-info-accent, #77b7ff) 24%, transparent) !important;
        border-radius: 8px !important;
      }

      @keyframes zut-pop-in {
        0% {
          opacity: 0;
          clip-path: inset(0 100% 0 0 round var(--zut-chip-radius, 7px));
          transform: translate3d(-50%, -16px, 0) scale(0.94);
          filter: blur(9px) brightness(1.18) saturate(1.12);
        }
        18% {
          opacity: .46;
          clip-path: inset(0 62% 0 0 round var(--zut-chip-radius, 7px));
          transform: translate3d(-50%, -8px, 0) scale(.972);
          filter: blur(5px) brightness(1.16) saturate(1.1);
        }
        38% {
          opacity: .92;
          clip-path: inset(0 14% 0 0 round var(--zut-chip-radius, 7px));
          transform: translate3d(-50%, 1px, 0) scale(1.018);
          filter: blur(1.5px) brightness(1.12) saturate(1.06);
        }
        58% {
          opacity: 1;
          clip-path: inset(0 0 0 0 round var(--zut-chip-radius, 7px));
          transform: translate3d(-50%, 2px, 0) scale(1.028);
          filter: blur(0) brightness(1.07) saturate(1.03);
        }
        78% {
          transform: translate3d(-50%, -0.8px, 0) scale(0.996);
        }
        100% {
          opacity: 1;
          clip-path: inset(0 0 0 0 round var(--zut-chip-radius, 7px));
          transform: translate3d(-50%, 0, 0) scale(1);
          filter: blur(0);
        }
      }

      @keyframes zut-fly-back {
        0% {
          opacity: 1;
          clip-path: inset(0 0 0 0 round var(--zut-chip-radius, 7px));
          transform: translate3d(-50%, 0, 0) scale(1);
          filter: blur(0);
        }
        24% {
          opacity: 1;
          clip-path: inset(0 0 0 0 round var(--zut-chip-radius, 7px));
          transform: translate3d(-50%, 1.5px, 0) scale(0.992);
          filter: blur(0) brightness(1.08) saturate(1.06);
        }
        72% {
          opacity: .48;
          clip-path: inset(0 0 0 42% round var(--zut-chip-radius, 7px));
          transform: translate3d(-50%, -11px, 0) scale(0.955);
          filter: blur(3px) brightness(1.12);
        }
        100% {
          opacity: 0;
          clip-path: inset(0 0 0 100% round var(--zut-chip-radius, 7px));
          transform: translate3d(-50%, -22px, 0) scale(0.92);
          filter: blur(7px) brightness(1.16);
        }
      }

      @keyframes zut-island-scan {
        0% { opacity: 0; transform: translateX(-150%) skewX(-14deg) scaleX(.78); }
        15% { opacity: .92; }
        58% { opacity: .98; }
        100% { opacity: 0; transform: translateX(calc(var(--zut-chip-max-width, 520px) + 82px)) skewX(-10deg) scaleX(1.18); }
      }

      @keyframes zut-ring {
        0% { opacity: 0; transform: scale(0.94); }
        24% { opacity: 0.72; }
        100% { opacity: 0; transform: scale(1.18); }
      }

      @keyframes zut-error-pulse {
        50% {
          box-shadow:
            0 12px 26px rgba(0, 0, 0, 0.38),
            0 0 30px color-mix(in srgb, var(--zut-error-accent, #ff6b7a) 72%, transparent);
        }
      }

      @keyframes zut-blackhole-spin {
        to { transform: rotate(360deg); }
      }

      @keyframes zut-blackhole-ring {
        to { transform: rotateX(64deg) rotateZ(360deg); }
      }

      @keyframes zut-blackhole-reverse {
        to { transform: rotate(-360deg); }
      }

      @keyframes zut-blackhole-dots {
        to { transform: rotate(360deg); }
      }

      @keyframes zut-blackhole-breathe {
        0%, 100% { opacity: .38; transform: scale(.86); }
        50% { opacity: .72; transform: scale(1.16); }
      }

      @keyframes zut-warp-twinkle {
        0%, 100% { opacity: .34; transform: scale(1); }
        50% { opacity: .62; transform: scale(1.04); }
      }

      @keyframes zut-warp-rush {
        0% { opacity: 0; transform: scale(.42) rotate(0deg); }
        22% { opacity: .6; }
        100% { opacity: 0; transform: scale(2.6) rotate(7deg); }
      }

      @keyframes zut-warp-core {
        to { transform: rotate(360deg); }
      }

      @keyframes zut-warp-core-rush {
        0% { opacity: .2; transform: scale(.6) rotate(0deg); }
        50% { opacity: .85; }
        100% { opacity: 0; transform: scale(1.3) rotate(-26deg); }
      }

      @keyframes zut-warp-core-pulse {
        0%, 100% {
          transform: scale(.7);
          opacity: .72;
          box-shadow: 0 0 6px color-mix(in srgb, var(--zut-accent, #77b7ff) 60%, transparent);
        }
        50% {
          transform: scale(1.05);
          opacity: 1;
          box-shadow: 0 0 13px color-mix(in srgb, var(--zut-accent, #77b7ff) 92%, #fff);
        }
      }
    `;
    (hostDocument.head || hostDocument.documentElement).appendChild(style);
  }

  function ensureLayer() {
    if (state.layer && hostDocument.body.contains(state.layer)) {
      return state.layer;
    }
    const layer = hostDocument.createElement('div');
    layer.id = LAYER_ID;
    layer.setAttribute('role', 'presentation');
    hostDocument.body.appendChild(layer);
    state.layer = layer;
    return layer;
  }

  function getSendDockParts() {
    return {
      formShell: hostDocument.getElementById('form_sheld'),
      sendForm: hostDocument.getElementById('send_form'),
      textarea: hostDocument.getElementById('send_textarea'),
      stopButton: hostDocument.getElementById('mes_stop'),
    };
  }

  function hasSendInputText() {
    const textarea = getSendDockParts().textarea;
    return String(textarea?.value || '').trim().length > 0;
  }

  function isSendFormFocused() {
    const sendForm = getSendDockParts().sendForm;
    const active = hostDocument.activeElement;
    return !!(sendForm && active && sendForm.contains(active));
  }

  function isVisibleElement(element) {
    if (!element) {
      return false;
    }
    const style = hostWindow.getComputedStyle?.(element);
    return !!style && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) !== 0;
  }

  function isSendFormBusy() {
    const { formShell, stopButton } = getSendDockParts();
    return !!(
      formShell?.classList?.contains('isExecutingCommandsFromChatInput')
      || formShell?.classList?.contains('script_paused')
      || isVisibleElement(stopButton)
    );
  }

  function canCollapseInputDock() {
    return !!state.settings?.inputDock && !hasSendInputText() && !isSendFormFocused() && !isSendFormBusy();
  }

  function syncInputDockClasses() {
    const root = hostDocument.documentElement;
    const enabled = !!state.settings?.inputDock;
    const expanded = enabled && (state.inputDockExpanded || hasSendInputText() || isSendFormFocused() || isSendFormBusy());
    const collapsed = enabled && !expanded;

    root.classList.toggle(`${PLUGIN_ID}-input-dock-on`, enabled);
    root.classList.toggle(`${PLUGIN_ID}-input-dock-expanded`, expanded);
    root.classList.toggle(`${PLUGIN_ID}-input-dock-collapsed`, collapsed);

    if (state.sendDockHandle) {
      state.sendDockHandle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      state.sendDockHandle.title = expanded ? '收起输入框' : '展开输入框';
      state.sendDockHandle.setAttribute('aria-label', expanded ? '收起输入框' : '展开输入框');
    }
  }

  function scheduleInputDockCollapse(delay = 900) {
    hostWindow.clearTimeout(state.sendDockCollapseTimer);
    state.sendDockCollapseTimer = hostWindow.setTimeout(() => {
      if (canCollapseInputDock()) {
        state.inputDockExpanded = false;
      }
      syncInputDockClasses();
    }, delay);
  }

  function expandInputDock({ focus = false } = {}) {
    state.inputDockExpanded = true;
    syncInputDockClasses();
    if (focus) {
      hostWindow.setTimeout(() => getSendDockParts().textarea?.focus?.(), 80);
    }
  }

  function collapseInputDock() {
    if (!canCollapseInputDock()) {
      syncInputDockClasses();
      return;
    }
    state.inputDockExpanded = false;
    syncInputDockClasses();
  }

  function cleanupInputDock() {
    hostWindow.clearTimeout(state.sendDockCollapseTimer);
    hostWindow.clearTimeout(state.sendDockRetryTimer);
    state.sendDockCollapseTimer = null;
    state.sendDockRetryTimer = null;
    state.sendDockObserver?.disconnect?.();
    state.sendDockObserver = null;
    if (typeof state.sendDockCleanup === 'function') {
      state.sendDockCleanup();
    }
    state.sendDockCleanup = null;
    state.sendDockHandle?.remove();
    state.sendDockHandle = null;
    state.inputDockExpanded = false;
    hostDocument.documentElement.classList.remove(`${PLUGIN_ID}-input-dock-on`);
    hostDocument.documentElement.classList.remove(`${PLUGIN_ID}-input-dock-expanded`);
    hostDocument.documentElement.classList.remove(`${PLUGIN_ID}-input-dock-collapsed`);
  }

  function ensureInputDock() {
    const { formShell, sendForm, textarea, stopButton } = getSendDockParts();
    if (!formShell || !sendForm || !textarea || !hostDocument.body) {
      hostWindow.clearTimeout(state.sendDockRetryTimer);
      state.sendDockRetryTimer = hostWindow.setTimeout(syncInputDockMode, 1200);
      return;
    }

    if (!state.sendDockHandle) {
      const handle = hostDocument.createElement('button');
      handle.id = SEND_DOCK_ID;
      handle.type = 'button';
      handle.setAttribute('aria-controls', 'send_form');
      handle.setAttribute('aria-label', '展开输入框');
      handle.title = '展开输入框';
      hostDocument.body.appendChild(handle);
      state.sendDockHandle = handle;
    }

    if (!state.sendDockCleanup) {
      const handleClick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (hostDocument.documentElement.classList.contains(`${PLUGIN_ID}-input-dock-collapsed`)) {
          expandInputDock({ focus: true });
        } else {
          collapseInputDock();
        }
      };
      const focusIn = (event) => {
        if (event.target?.closest?.('#send_form')) {
          expandInputDock();
        }
      };
      const focusOut = (event) => {
        if (event.target?.closest?.('#send_form')) {
          scheduleInputDockCollapse();
        }
      };
      const input = (event) => {
        if (event.target?.id === 'send_textarea') {
          syncInputDockClasses();
          if (!hasSendInputText()) {
            scheduleInputDockCollapse(1100);
          }
        }
      };
      const click = (event) => {
        if (event.target?.closest?.(`#${SEND_DOCK_ID}`)) {
          return;
        }
        if (event.target?.closest?.('#send_form')) {
          expandInputDock();
          if (event.target?.closest?.('#send_but, #mes_continue, #mes_impersonate')) {
            scheduleInputDockCollapse(1200);
          }
          return;
        }
        scheduleInputDockCollapse(520);
      };
      const keydown = (event) => {
        if (event.key === 'Escape' && isSendFormFocused() && !hasSendInputText()) {
          getSendDockParts().textarea?.blur?.();
          collapseInputDock();
        }
      };

      state.sendDockHandle.addEventListener('click', handleClick);
      hostDocument.addEventListener('focusin', focusIn, true);
      hostDocument.addEventListener('focusout', focusOut, true);
      hostDocument.addEventListener('input', input, true);
      hostDocument.addEventListener('click', click, true);
      hostDocument.addEventListener('keydown', keydown, true);

      const Observer = hostWindow.MutationObserver || MutationObserver;
      state.sendDockObserver = new Observer(() => syncInputDockClasses());
      state.sendDockObserver.observe(formShell, { attributes: true, attributeFilter: ['class', 'style'] });
      if (stopButton) {
        state.sendDockObserver.observe(stopButton, { attributes: true, attributeFilter: ['class', 'style'] });
      }

      state.sendDockCleanup = () => {
        state.sendDockHandle?.removeEventListener('click', handleClick);
        hostDocument.removeEventListener('focusin', focusIn, true);
        hostDocument.removeEventListener('focusout', focusOut, true);
        hostDocument.removeEventListener('input', input, true);
        hostDocument.removeEventListener('click', click, true);
        hostDocument.removeEventListener('keydown', keydown, true);
      };
    }

    if (!hasSendInputText() && !isSendFormFocused() && !isSendFormBusy()) {
      state.inputDockExpanded = false;
    }
    syncInputDockClasses();
  }

  function syncInputDockMode() {
    if (!state.settings?.inputDock) {
      cleanupInputDock();
      return;
    }
    ensureInputDock();
  }

  function classifyToast(toast) {
    const classList = toast?.classList;
    if (classList?.contains('toast-error') || classList?.contains('acu-toast--error')) {
      return 'error';
    }
    if (classList?.contains('toast-warning') || classList?.contains('acu-toast--warning')) {
      return 'warning';
    }
    if (classList?.contains('toast-success') || classList?.contains('acu-toast--success')) {
      return 'success';
    }
    return 'info';
  }

  function statusLabel(type) {
    return ({
      success: 'Done',
      info: 'Notice',
      warning: 'Warning',
      error: 'Error',
    })[type] || 'Notice';
  }

  function isToastCloseLikeAction(node) {
    if (!node) {
      return true;
    }
    if (node.classList?.contains('toast-close-button')) {
      return true;
    }
    const text = cleanText(node.textContent || node.getAttribute?.('aria-label') || node.getAttribute?.('value') || '');
    return !text || /^×$/.test(text);
  }

  function getToastActionControls(toast) {
    const controls = Array.from(
      toast.querySelectorAll?.('button, a[href], .qrf-abort-btn, [role="button"], input[type="button"], input[type="submit"], .menu_button')
      || [],
    );
    return controls.filter((control) => !isToastCloseLikeAction(control));
  }

  function findActionButton(toast) {
    const controls = getToastActionControls(toast);
    if (controls.length !== 1) {
      return null;
    }
    return controls[0];
  }

  function truncateText(text) {
    const limit = state.settings?.maxTextLength || DEFAULT_SETTINGS.maxTextLength;
    if (!text || text.length <= limit) {
      return text || '';
    }
    return `${text.slice(0, Math.max(1, limit - 1))}…`;
  }

  function sanitizeActionHintMessage(message, actionButton) {
    let next = cleanText(message);
    if (!actionButton || !next) {
      return next;
    }
    next = next
      .replace(/(?:点击|按)?(?:终止|停止|取消|中止)(?:按钮)?(?:可|即可|以便|来)?[^，。；;！!]*[，。；;！!]?/gi, ' ')
      .replace(/(?:可|可随时|支持)?(?:终止|停止|取消|中止)[^，。；;！!]*[，。；;！!]?/gi, ' ')
      .replace(/\(\s*(?:终止|停止|取消|中止)[^)]*\)/gi, ' ')
      .replace(/（\s*(?:终止|停止|取消|中止)[^）]*）/gi, ' ');
    return cleanText(next);
  }

  function extractToastData(toast) {
    const type = classifyToast(toast);
    const titleNode = toast.querySelector?.('.toast-title, .toastr-title, strong, b');
    const messageNode = toast.querySelector?.('.toast-message, .toastr-message, .message, .toast-content') || toast;
    const actionControls = getToastActionControls(toast);
    const actionButton = findActionButton(toast);
    const rawActionText = actionButton ? cleanText(actionButton.textContent || actionButton.getAttribute?.('aria-label')) : '';
    const actionText = /终止|停止|取消|中止|abort|cancel|stop/i.test(rawActionText) ? '中止' : rawActionText || '';
    let title = cleanText(titleNode?.textContent) || statusLabel(type);
    let message = cleanText(messageNode.textContent || toast.textContent);

    if (title && message.startsWith(title)) {
      message = message.slice(title.length).trim();
    }
    if (actionText) {
      message = message.replace(actionText, '').trim();
    }
    message = sanitizeActionHintMessage(message, actionButton);
    if (!message || message === title) {
      message = title;
      title = statusLabel(type);
    }

    return {
      type,
      title,
      message: truncateText(message),
      actionControls,
      actionButton,
      actionText,
      passthroughOriginalToast: actionControls.length > 1 || (actionControls.length > 0 && !actionButton),
      sourceToast: toast,
    };
  }

  function toastText(data) {
    return cleanText(`${data?.title || ''} ${data?.message || ''} ${data?.sourceToast?.textContent || ''}`);
  }

  function isBatchProgressToast(data) {
    const text = toastText(data);
    return /第\s*\d+\s*\/\s*\d+\s*批[:：]?/.test(text)
      && !/成功|完成|失败|错误|已取消|取消完成/.test(text);
  }

  function isDatabaseWorkflowToast(data) {
    const text = toastText(data);
    return /SP.?数据库|星.?数据库|数据库|正在填表|填表|准备AI输入|正在更新.*表格|更新表格|手动更新|正在处理.*表格|表格需要更新|第\s*\d+\s*\/\s*\d+\s*批|第\s*[一二三四五六七八九十\d]+\s*批|批次|本批|剧情规划|标签摘取|recall|过往的记忆|正在归档|合并纪要|聚合注入/i.test(text);
  }

  function isDatabaseWorkflowStart(data) {
    const text = toastText(data);
    return (data?.actionButton || isBatchProgressToast(data))
      && /正在填表|填表|准备AI输入|正在更新.*表格|更新表格|手动更新|正在处理.*表格|第\s*\d+\s*\/\s*\d+\s*批|第\s*[一二三四五六七八九十\d]+\s*批|批次|本批|正在读取|正在分析|过往的记忆|合并纪要/i.test(text)
      && !/成功|完成|失败|错误|已取消|取消完成/.test(text);
  }

  function isPersistentToast(data) {
    if (data?.actionButton) {
      return true;
    }
    return isDatabaseWorkflowStart(data) || isBatchProgressToast(data);
  }

  function isCompletionToast(data) {
    const text = toastText(data);
    return data?.type === 'success'
      || data?.type === 'error'
      || /成功|完成|失败|错误|已取消|取消完成|数据库已更新|更新完成|处理完成/.test(text);
  }

  function shouldPassthroughStartupToast(data) {
    return false;
  }

  function isStartupDebugToastData(data) {
    const text = toastText(data);
    return /启动优化|后台仍在初始化中|初始化中|脚本启动|已加载|数据库自动更新脚本已加载|启动完成前|部分功能会稍后就绪|聚合注入/i.test(text);
  }

  function getDebugRect(node) {
    if (!node?.getBoundingClientRect) {
      return null;
    }
    const rect = node.getBoundingClientRect();
    return {
      left: Math.round(rect.left),
      top: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };
  }

  function logStartupDebug(stage, data, extra = {}) {
    const age = Date.now() - Number(state.startedAt || 0);
    if (age > STARTUP_DEBUG_WINDOW || !isStartupDebugToastData(data)) {
      return;
    }
    const sourceToast = data?.sourceToast || null;
    const payload = {
      age,
      stage,
      title: data?.title || '',
      message: data?.message || '',
      type: data?.type || '',
      passthroughOriginalToast: !!data?.passthroughOriginalToast,
      sourceRect: getDebugRect(sourceToast),
      sourceStyle: sourceToast ? {
        left: sourceToast.style.left || '',
        top: sourceToast.style.top || '',
        transform: sourceToast.style.transform || '',
        opacity: sourceToast.style.opacity || '',
        visibility: sourceToast.style.visibility || '',
      } : null,
      ...extra,
    };
    console.log('[酒馆提示框美化][startup-debug]', payload);
  }

  function getStartupSourceWidth(data) {
    return isStartupDebugToastData(data) ? 1 : 0;
  }

  function closePersistentDatabaseChips() {
    state.active.slice().forEach((chip) => {
      if (chip.dataset.zutPersistent === 'true') {
        closeChip(chip);
      }
    });
  }

  function refreshActiveLoadingFx() {
    const loadingFx = state.settings?.loadingFx || DEFAULT_SETTINGS.loadingFx;
    state.active.forEach((chip) => {
      const persistent = chip.dataset.zutPersistent === 'true';
      chip.classList.remove(`${PLUGIN_ID}-loading-blackhole`);
      if (loadingFx !== 'starwarp') {
        chip.classList.remove(`${PLUGIN_ID}-fx-starwarp`, `${PLUGIN_ID}-loading-starwarp`);
      }
      chip.classList.toggle(`${PLUGIN_ID}-fx-starwarp`, loadingFx === 'starwarp');
      chip.classList.toggle(`${PLUGIN_ID}-loading-starwarp`, persistent && loadingFx === 'starwarp');
      if (persistent) {
        chip.dataset.zutLoadingFx = loadingFx;
      } else {
        delete chip.dataset.zutLoadingFx;
      }
    });
  }

  function animateChipEnter(chip) {
    const gsap = getGsap();
    if (!chip || !chip.isConnected || !isGsapToastMode() || !gsap) {
      return;
    }
    if ((state.settings?.loadingFx || DEFAULT_SETTINGS.loadingFx) === 'starwarp') {
      animateChipEnterStarwarp(chip, gsap);
      return;
    }
    const scan = chip.querySelector(`.${PLUGIN_ID}-scan`);
    const ring = chip.querySelector(`.${PLUGIN_ID}-ring`);
    const radius = hostWindow.getComputedStyle(chip).getPropertyValue('--zut-chip-radius').trim() || '7px';
    gsap.killTweensOf([chip, scan, ring]);
    gsap.set(chip, {
      xPercent: -50,
      y: -18,
      scale: 0.958,
      autoAlpha: 0,
      clipPath: `inset(0 100% 0 0 round ${radius})`,
    });
    if (scan) {
      gsap.set(scan, { x: -118, autoAlpha: 0, scaleX: 0.96 });
    }
    if (ring) {
      gsap.set(ring, { scale: 0.94, autoAlpha: 0 });
    }
    const travel = Math.max(132, chip.offsetWidth + 118);
    const timeline = gsap.timeline({
      defaults: { overwrite: 'auto' },
      onComplete: () => {
        gsap.set(chip, { x: 0, xPercent: -50 });
        applyChipCenter(chip);
        scheduleCenterDebugOnce(chip, 'enter-complete-summary', null, { chipRect: getDebugRect(chip) });
      },
    });
    timeline.to(chip, {
      duration: 0.46,
      autoAlpha: 1,
      x: 0,
      xPercent: -50,
      y: 2,
      scale: 1.018,
      clipPath: `inset(0 0% 0 0 round ${radius})`,
      ease: 'expo.out',
    }, 0);
    timeline.to(chip, {
      duration: 0.16,
      y: -0.5,
      scale: 0.997,
      ease: 'sine.out',
    }, 0.30);
    timeline.to(chip, {
      duration: 0.18,
      y: 0,
      x: 0,
      xPercent: -50,
      scale: 1,
      ease: 'sine.inOut',
    }, 0.46);
    if (scan) {
      timeline.to(scan, {
        duration: 0.82,
        x: travel,
        autoAlpha: 0.96,
        scaleX: 1.06,
        ease: 'power1.inOut',
      }, 0.08);
      timeline.to(scan, {
        duration: 0.26,
        autoAlpha: 0,
        scaleX: 1.12,
        ease: 'power1.out',
      }, 0.62);
    }
    if (ring) {
      timeline.to(ring, {
        duration: 0.58,
        autoAlpha: 0.38,
        scale: 1.1,
        ease: 'power2.out',
      }, 0.08);
      timeline.to(ring, {
        duration: 0.28,
        autoAlpha: 0,
        ease: 'power1.out',
      }, 0.46);
    }
  }

  function splitIntoCharSpans(el) {
    const t = el.textContent;
    el.textContent = '';
    return Array.from(t).map(ch => {
      const s = hostDocument.createElement('span');
      s.style.cssText = 'display:inline-block;white-space:pre';
      s.textContent = ch;
      el.appendChild(s);
      return s;
    });
  }

  function animateChipEnterStarwarp(chip, gsap) {
    const scan = chip.querySelector(`.${PLUGIN_ID}-scan`);
    const ring = chip.querySelector(`.${PLUGIN_ID}-ring`);
    const title = chip.querySelector(`.${PLUGIN_ID}-title`);
    const text = chip.querySelector(`.${PLUGIN_ID}-text`);
    const action = chip.querySelector(`.${PLUGIN_ID}-action`);
    const loader = chip.querySelector(`.${PLUGIN_ID}-loader`);
    const titleTextEl = title?.querySelector(`.${PLUGIN_ID}-title-text`);
    const titleChars = titleTextEl ? splitIntoCharSpans(titleTextEl) : [];
    const textChars = text ? splitIntoCharSpans(text) : [];
    const radius = hostWindow.getComputedStyle(chip).getPropertyValue('--zut-chip-radius').trim() || '7px';
    const parts = [chip, scan, ring, title, text, action, loader, ...titleChars, ...textChars].filter(Boolean);
    gsap.killTweensOf(parts);
    gsap.set(chip, {
      xPercent: -50,
      x: 0,
      y: -18,
      scaleX: 0.98,
      scaleY: 0.94,
      rotationZ: 0,
      autoAlpha: 0,
      transformPerspective: 620,
      rotationX: -10,
      filter: 'blur(9px) saturate(1.28) brightness(1.2)',
      backgroundPosition: '0% 50%, 50% 50%, 50% 50%, 50% 50%',
      clipPath: 'none',
    });
    if (scan) {
      gsap.set(scan, { x: -130, autoAlpha: 0, scaleX: 0.62, skewX: -14 });
    }
    if (ring) {
      gsap.set(ring, { scaleX: 0.86, scaleY: 0.72, autoAlpha: 0 });
    }
    if (titleChars.length) {
      gsap.set(titleChars, { x: 8, autoAlpha: 0, filter: 'blur(3px)' });
    }
    if (textChars.length) {
      gsap.set(textChars, { x: 10, autoAlpha: 0, filter: 'blur(4px)' });
    }
    if (action) {
      gsap.set(action, { x: 8, autoAlpha: 0, filter: 'blur(4px)' });
    }
    if (loader) {
      gsap.set(loader, { scaleX: 0.62, autoAlpha: 0, transformOrigin: '50% 50%' });
    }
    const travel = Math.max(220, chip.offsetWidth + 190);
    const timeline = gsap.timeline({
      defaults: { overwrite: 'auto' },
      onComplete: () => {
        gsap.set(chip, { x: 0, xPercent: -50 });
        applyChipCenter(chip);
        scheduleCenterDebugOnce(chip, 'starwarp-enter-complete-summary', null, { chipRect: getDebugRect(chip) });
      },
    });
    timeline.to(chip, {
      duration: 0.18,
      autoAlpha: 1,
      x: 0,
      xPercent: -50,
      filter: 'blur(5px) saturate(1.34) brightness(1.24)',
      ease: 'power1.out',
    }, 0);
    timeline.to(chip, {
      duration: 0.58,
      x: 0,
      xPercent: -50,
      y: 1,
      scaleX: 1.012,
      scaleY: 1.008,
      rotationX: 0,
      filter: 'blur(0px) saturate(1.12) brightness(1.08)',
      backgroundPosition: '82% 50%, 50% 50%, 50% 50%, 50% 50%',
      ease: 'expo.out',
    }, 0.08);
    timeline.to(chip, {
      duration: 0.38,
      scaleX: 1,
      scaleY: 1,
      x: 0,
      xPercent: -50,
      y: 0,
      rotationX: 0,
      filter: 'blur(0px) saturate(1) brightness(1)',
      ease: 'sine.inOut',
    }, 0.58);
    if (scan) {
      timeline.to(scan, {
        duration: 0.82,
        x: travel,
        autoAlpha: 0.82,
        scaleX: 1.16,
        skewX: -8,
        ease: 'power2.inOut',
      }, 0.10);
      timeline.to(scan, {
        duration: 0.26,
        autoAlpha: 0,
        scaleX: 1.36,
        ease: 'power2.out',
      }, 0.72);
    }
    if (ring) {
      timeline.to(ring, {
        duration: 0.46,
        autoAlpha: 0.44,
        scaleX: 1.04,
        scaleY: 1.16,
        ease: 'power3.out',
      }, 0.06);
      timeline.to(ring, {
        duration: 0.42,
        autoAlpha: 0,
        scaleX: 1.1,
        scaleY: 1.26,
        ease: 'sine.out',
      }, 0.44);
    }
    if (titleChars.length) {
      timeline.to(titleChars, {
        duration: 0.26,
        x: 0,
        autoAlpha: 1,
        filter: 'blur(0px)',
        ease: 'power3.out',
        stagger: 0.034,
      }, 0.20);
    }
    if (textChars.length) {
      timeline.to(textChars, {
        duration: 0.28,
        x: 0,
        autoAlpha: 1,
        filter: 'blur(0px)',
        ease: 'power3.out',
        stagger: 0.030,
      }, 0.28);
    }
    if (action) {
      timeline.to(action, {
        duration: 0.32,
        x: 0,
        autoAlpha: 1,
        filter: 'blur(0px)',
        ease: 'power2.out',
      }, 0.40);
    }
    if (loader) {
      timeline.to(loader, {
        duration: 0.42,
        scaleX: 1,
        autoAlpha: 1,
        ease: 'power3.out',
      }, 0.24);
    }
  }

  function animateChipClose(chip, onComplete) {
    const gsap = getGsap();
    if (!chip || !isGsapToastMode() || !gsap) {
      hostWindow.setTimeout(() => onComplete?.(), 500);
      return;
    }
    if ((chip.dataset.zutLoadingFx || state.settings?.loadingFx || DEFAULT_SETTINGS.loadingFx) === 'starwarp') {
      animateChipCloseStarwarp(chip, gsap, onComplete);
      return;
    }
    const scan = chip.querySelector(`.${PLUGIN_ID}-scan`);
    const ring = chip.querySelector(`.${PLUGIN_ID}-ring`);
    const radius = hostWindow.getComputedStyle(chip).getPropertyValue('--zut-chip-radius').trim() || '7px';
    gsap.killTweensOf([chip, scan, ring]);
    const timeline = gsap.timeline({
      defaults: { overwrite: 'auto' },
      onComplete: () => onComplete?.(),
    });
    timeline.to(chip, {
      duration: 0.30,
      autoAlpha: 0,
      y: -16,
      scale: 0.948,
      clipPath: `inset(0 0 0 100% round ${radius})`,
      ease: 'power2.in',
    }, 0);
    if (scan) {
      timeline.to(scan, {
        duration: 0.22,
        autoAlpha: 0,
        x: Math.max(48, chip.offsetWidth * 0.32),
        ease: 'power1.in',
      }, 0);
    }
    if (ring) {
      timeline.to(ring, {
        duration: 0.22,
        autoAlpha: 0,
        scale: 0.98,
        ease: 'power1.in',
      }, 0);
    }
  }

  function animateChipCloseStarwarp(chip, gsap, onComplete) {
    const scan = chip.querySelector(`.${PLUGIN_ID}-scan`);
    const ring = chip.querySelector(`.${PLUGIN_ID}-ring`);
    const title = chip.querySelector(`.${PLUGIN_ID}-title`);
    const text = chip.querySelector(`.${PLUGIN_ID}-text`);
    const action = chip.querySelector(`.${PLUGIN_ID}-action`);
    const loader = chip.querySelector(`.${PLUGIN_ID}-loader`);
    const parts = [chip, scan, ring, title, text, action, loader].filter(Boolean);
    gsap.killTweensOf(parts);
    const timeline = gsap.timeline({
      defaults: { overwrite: 'auto' },
      onComplete: () => onComplete?.(),
    });
    if (title) {
      timeline.to(title, { duration: 0.20, y: -3, autoAlpha: 0, filter: 'blur(3px)', ease: 'power1.in' }, 0);
    }
    if (text) {
      timeline.to(text, { duration: 0.22, y: 5, autoAlpha: 0, filter: 'blur(4px)', ease: 'power1.in' }, 0.02);
    }
    if (action) {
      timeline.to(action, { duration: 0.18, x: 7, autoAlpha: 0, filter: 'blur(3px)', ease: 'power1.in' }, 0.02);
    }
    if (loader) {
      timeline.to(loader, { duration: 0.22, scaleX: 0.58, autoAlpha: 0, ease: 'power2.in' }, 0.02);
    }
    timeline.to(chip, {
      duration: 0.44,
      autoAlpha: 0,
      x: 34,
      y: -12,
      scaleX: 0.98,
      scaleY: 0.96,
      rotationX: 8,
      filter: 'blur(9px) saturate(1.18) brightness(1.16)',
      backgroundPosition: '100% 50%, 50% 50%, 50% 50%, 50% 50%',
      ease: 'power3.inOut',
    }, 0.04);
    if (scan) {
      timeline.to(scan, {
        duration: 0.34,
        autoAlpha: 0.56,
        x: Math.max(90, chip.offsetWidth * 0.55),
        scaleX: 1.42,
        skewX: -6,
        ease: 'power2.in',
      }, 0.04);
      timeline.to(scan, { duration: 0.14, autoAlpha: 0 }, 0.34);
    }
    if (ring) {
      timeline.to(ring, {
        duration: 0.28,
        autoAlpha: 0.22,
        scaleX: 1.08,
        scaleY: 0.92,
        ease: 'power1.inOut',
      }, 0.04);
      timeline.to(ring, { duration: 0.16, autoAlpha: 0 }, 0.26);
    }
  }

  function shouldSuppressDatabaseToast(data) {
    if (Date.now() >= state.suppressWorkflowToastsUntil) {
      return false;
    }
    return isDatabaseWorkflowToast(data) || data?.type === 'error';
  }

  function getChipTargetPosition(chipsBefore = state.active) {
    const metrics = getViewportMetrics();
    const centerX = getChipCenterX();
    const gap = 6;
    let top = metrics.top + Math.max(0, state.settings?.topOffset || DEFAULT_SETTINGS.topOffset) + (state.settings?.offsetY || 0);
    const source = Array.isArray(chipsBefore) ? chipsBefore : [];
    source.forEach((chip) => {
      if (!chip || !chip.isConnected || chip.classList.contains('zut-closing')) {
        return;
      }
      top += chip.offsetHeight + gap;
    });
    return { left: centerX, top };
  }

  function layoutChips() {
    state.active = state.active.filter((chip) => chip && chip.isConnected && !chip.classList.contains('zut-closing'));
    const metrics = getViewportMetrics();
    if (!state.active.length || !metrics.width) {
      return;
    }
    const gsap = isGsapToastMode() ? getGsap() : null;
    const centerX = getChipCenterX();
    const gap = 6;
    let top = metrics.top + Math.max(0, state.settings?.topOffset || DEFAULT_SETTINGS.topOffset) + (state.settings?.offsetY || 0);

    state.active.forEach((chip, index) => {
      applyChipViewportBounds(chip);
      chip.style.zIndex = String(999999 - index);
      if (gsap) {
        if (chip.dataset.zutPositioned !== 'true') {
          gsap.set(chip, { left: centerX, top, x: 0, xPercent: -50 });
          chip.dataset.zutPositioned = 'true';
        } else {
          gsap.to(chip, {
            duration: 0.30,
            left: centerX,
            top,
            x: 0,
            xPercent: -50,
            ease: 'power3.out',
            overwrite: 'auto',
          });
        }
      } else {
        chip.style.left = `${centerX}px`;
        chip.style.top = `${top}px`;
        chip.dataset.zutPositioned = 'true';
      }
      top += chip.offsetHeight + gap;
      hostWindow.requestAnimationFrame(() => applyChipCenter(chip));
      if (index === state.active.length - 1) {
        scheduleCenterDebugOnce(chip, 'layout-final', null, {
          index,
          computedLeft: chip.style.left || '',
          computedTop: chip.style.top || '',
        });
      }
    });
  }

  function closeChip(chip) {
    if (!chip || chip.classList.contains('zut-closing')) {
      return;
    }
    if (chip.contains(hostDocument.activeElement)) {
      hostDocument.activeElement?.blur?.();
    }
    hostWindow.clearTimeout(Number(chip.dataset.zutTimer || 0));
    chip.classList.add('zut-closing');
    state.active = state.active.filter((item) => item !== chip);
    layoutChips();
    animateChipClose(chip, () => chip.remove());
  }

  function updateChip(chip, data) {
    const startupSourceWidth = getStartupSourceWidth(data);
    const startupWide = chip.dataset.zutStartupWide === 'true' || startupSourceWidth > 0;
    if (startupSourceWidth > 0) {
      chip.dataset.zutStartupWide = 'true';
    }
    if (shouldUseWideChip(data)) {
      chip.dataset.zutWide = 'true';
    } else {
      delete chip.dataset.zutWide;
    }
    chip.className = `${PLUGIN_ID}-chip ${PLUGIN_ID}-${data.type}${startupWide ? ` ${PLUGIN_ID}-startup-wide` : ''}`;
    if (startupWide) {
      chip.querySelector(`.${PLUGIN_ID}-title-text`).textContent = cleanText(`${data.title || statusLabel(data.type)} ${data.message || ''}`);
      chip.querySelector(`.${PLUGIN_ID}-text`).textContent = '';
    } else {
      chip.querySelector(`.${PLUGIN_ID}-title-text`).textContent = data.title || statusLabel(data.type);
      chip.querySelector(`.${PLUGIN_ID}-text`).textContent = data.message || '';
    }

    const oldAction = chip.querySelector(`.${PLUGIN_ID}-action`);
    if (oldAction) {
      oldAction.remove();
    }
    delete chip.dataset.zutHasAction;

    if (data.actionButton) {
      chip.dataset.zutHasAction = 'true';
      const button = hostDocument.createElement('button');
      button.type = 'button';
      button.className = `${PLUGIN_ID}-action`;
      button.textContent = /终止|停止|取消|中止|abort|cancel|stop/i.test(data.actionText || '') ? '中止' : data.actionText || '中止';
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (isDatabaseWorkflowToast(data) || /终止|停止|取消|中止|abort|cancel|stop/i.test(data.actionText || '')) {
          state.suppressWorkflowToastsUntil = Date.now() + 1800;
        }
        button.disabled = true;
        closeChip(chip);
        hostWindow.setTimeout(() => {
          try {
            data.actionButton.click();
          } catch (error) {
            console.warn('[酒馆提示框美化] action button click failed', error);
          }
        }, 0);
      });
      chip.appendChild(button);
    }

    hostWindow.clearTimeout(Number(chip.dataset.zutTimer || 0));
    const persistent = isPersistentToast(data);
    const loadingFx = state.settings?.loadingFx || DEFAULT_SETTINGS.loadingFx;
    chip.classList.remove(`${PLUGIN_ID}-loading-blackhole`);
    if (loadingFx !== 'starwarp') {
      chip.classList.remove(`${PLUGIN_ID}-fx-starwarp`, `${PLUGIN_ID}-loading-starwarp`);
    }
    chip.classList.toggle(`${PLUGIN_ID}-fx-starwarp`, loadingFx === 'starwarp');
    chip.classList.toggle(`${PLUGIN_ID}-loading-starwarp`, persistent && loadingFx === 'starwarp');
    applyChipViewportBounds(chip);

    if (persistent) {
      chip.dataset.zutPersistent = 'true';
      chip.dataset.zutLoadingFx = loadingFx;
      delete chip.dataset.zutBlackholeCompact;
      delete chip.dataset.zutTimer;
    } else {
      delete chip.dataset.zutPersistent;
      delete chip.dataset.zutLoadingFx;
      delete chip.dataset.zutBlackholeCompact;
      const timeout = data.type === 'error' ? state.settings.errorDuration : state.settings.duration;
      chip.dataset.zutTimer = String(hostWindow.setTimeout(() => closeChip(chip), timeout));
    }
    hostWindow.requestAnimationFrame(layoutChips);
  }

  function showChip(data) {
    injectStyle();
    const layer = ensureLayer();

    state.active = state.active.filter((chip) => chip && chip.isConnected && !chip.classList.contains('zut-closing'));
    while (state.active.length >= state.settings.maxStack) {
      const oldest = state.active[0];
      if (!oldest) {
        break;
      }
      closeChip(oldest);
    }

    const chip = hostDocument.createElement('div');
    chip.className = `${PLUGIN_ID}-chip ${PLUGIN_ID}-${data.type}`;
    chip.innerHTML = `
      <span class="${PLUGIN_ID}-scan" aria-hidden="true"></span>
      <span class="${PLUGIN_ID}-ring" aria-hidden="true"></span>
      <div class="${PLUGIN_ID}-title">
        <span class="${PLUGIN_ID}-loader" aria-hidden="true"><span></span><span></span><span></span></span>
        <span class="${PLUGIN_ID}-dot"></span>
        <span class="${PLUGIN_ID}-title-text"></span>
      </div>
      <div class="${PLUGIN_ID}-text"></div>
    `;

    chip.addEventListener('click', (event) => {
      if (event.target?.closest?.(`.${PLUGIN_ID}-action`)) {
        return;
      }
      closeChip(chip);
    });

    const initialPosition = getChipTargetPosition(state.active);
    const startupSourceWidth = getStartupSourceWidth(data);
    if (startupSourceWidth > 0) {
      chip.dataset.zutStartupWide = 'true';
      chip.classList.add(`${PLUGIN_ID}-startup-wide`);
    }
    if (shouldUseWideChip(data)) {
      chip.dataset.zutWide = 'true';
    }
    applyChipViewportBounds(chip);
    chip.style.left = `${initialPosition.left}px`;
    chip.style.top = `${initialPosition.top}px`;
    chip.dataset.zutPositioned = 'true';
    layer.appendChild(chip);
    state.active.push(chip);
    logStartupDebug('show-chip-created', data, {
      chipRect: getDebugRect(chip),
      chipStyle: {
        left: chip.style.left || '',
        top: chip.style.top || '',
        transform: chip.style.transform || '',
        width: chip.style.width || '',
      },
      startupSourceWidth,
      initialPosition,
    });
    scheduleCenterDebugOnce(chip, 'show-chip-summary', data, {
      startupSourceWidth,
      initialPosition,
      chipRect: getDebugRect(chip),
    });
    updateChip(chip, data);
    hostWindow.requestAnimationFrame(() => applyChipCenter(chip));
    hostWindow.requestAnimationFrame(() => {
      logStartupDebug('show-chip-before-enter', data, {
        chipRect: getDebugRect(chip),
        computedTransform: hostWindow.getComputedStyle(chip).transform,
      });
      animateChipEnter(chip);
      hostWindow.setTimeout(() => {
        logStartupDebug('show-chip-after-enter', data, {
          chipRect: getDebugRect(chip),
          chipStyle: {
            left: chip.style.left || '',
            top: chip.style.top || '',
            transform: chip.style.transform || '',
            width: chip.style.width || '',
          },
          computedTransform: hostWindow.getComputedStyle(chip).transform,
        });
        scheduleCenterDebugOnce(chip, 'after-enter-summary', data, {
          chipRect: getDebugRect(chip),
        });
      }, 180);
    });
    return chip;
  }

  function hideOriginalToast(toast) {
    if (!toast || state.hiddenSources.has(toast)) {
      return;
    }
    toast.dataset.zutOriginalInlineStyle = toast.getAttribute('style') || '';
    toast.style.setProperty('opacity', '0', 'important');
    toast.style.setProperty('pointer-events', 'none', 'important');
    toast.style.setProperty('visibility', 'hidden', 'important');
    state.hiddenSources.add(toast);
  }

  function restoreOriginalToast(toast) {
    if (!toast || !state.hiddenSources.has(toast)) {
      return;
    }
    const original = toast.dataset.zutOriginalInlineStyle || '';
    if (original) {
      toast.setAttribute('style', original);
    } else {
      toast.removeAttribute('style');
    }
    delete toast.dataset.zutOriginalInlineStyle;
    state.hiddenSources.delete(toast);
  }

  function isSafeModeActive() {
    return Date.now() < state.safeModeUntil;
  }

  function enterSafeMode(reason) {
    const now = Date.now();
    state.safeModeUntil = Math.max(state.safeModeUntil, now + SAFE_MODE_DURATION);
    if (now - state.safeNoticeAt > 8000) {
      state.safeNoticeAt = now;
      console.warn('[酒馆提示框美化] 已进入防爆保护，临时降低提示扫描频率', reason);
    }
  }

  function trackToastBurst(data) {
    const now = Date.now();
    if (now - state.toastBurstStartedAt > TOAST_BURST_WINDOW) {
      state.toastBurstStartedAt = now;
      state.toastBurstCount = 0;
    }
    state.toastBurstCount += 1;
    if (state.toastBurstCount > TOAST_BURST_LIMIT || (isDatabaseWorkflowToast(data) && state.toastBurstCount > 5)) {
      enterSafeMode('toast-burst');
    }
  }

  function shouldThrottleToast(data) {
    if (!isSafeModeActive()) {
      return false;
    }
    if (data?.actionButton || data?.type === 'error' || isCompletionToast(data)) {
      return false;
    }
    return isDatabaseWorkflowToast(data) || state.toastBurstCount > TOAST_BURST_LIMIT;
  }

  function isToastContainerNode(node) {
    return !!node?.matches?.(TOAST_CONTAINER_SELECTOR);
  }

  function getNodeSignature(node) {
    const className = typeof node?.className === 'string' ? node.className : '';
    return `${node?.id || ''} ${className}`;
  }

  function mayContainToast(node) {
    if (!node?.matches) {
      return false;
    }
    if (isToastContainerNode(node) || node.matches(FAST_TOAST_SELECTOR)) {
      return true;
    }
    return /toast|toastr|notification|notify|popup|swal|dialog|modal|acu/i.test(getNodeSignature(node));
  }

  function isToastElement(node) {
    if (!node?.matches?.(SOURCE_SELECTOR)) {
      return false;
    }
    if (node.id === LAYER_ID || node.id === PANEL_ID || node.closest?.(`#${LAYER_ID}, #${PANEL_ID}`)) {
      return false;
    }
    if (node.classList?.contains('toast-container')) {
      return false;
    }
    const text = cleanText(node.textContent || '');
    return text.length > 0 && text.length < 2000;
  }

  function scanToastContainers(doc) {
    if (!doc?.querySelectorAll) {
      return;
    }
    doc.querySelectorAll(TOAST_CONTAINER_SELECTOR).forEach((container) => {
      container.querySelectorAll?.(SOURCE_SELECTOR).forEach(handleToast);
    });
    doc.querySelectorAll('body > .toast, body > .toast-info, body > .toast-success, body > .toast-warning, body > .toast-error, body > .acu-toast').forEach(handleToast);
  }

  function scheduleToastContainerScan() {
    if (state.toastContainerScanTimer) {
      return;
    }
    state.toastContainerScanTimer = hostWindow.setTimeout(() => {
      state.toastContainerScanTimer = null;
      observedDocuments.forEach(scanToastContainers);
    }, 80);
  }

  function scanAddedNodeForToasts(node) {
    if (!node || node.nodeType !== 1) {
      return;
    }
    if (isToastElement(node)) {
      handleToast(node);
      return;
    }
    if (isSafeModeActive()) {
      if (isToastContainerNode(node)) {
        node.querySelectorAll?.(SOURCE_SELECTOR).forEach(handleToast);
      } else {
        scheduleToastContainerScan();
      }
      return;
    }
    if (mayContainToast(node)) {
      node.querySelectorAll?.(SOURCE_SELECTOR).forEach(handleToast);
    }
  }

  function handleToast(toast) {
    if (!state.settings.enabled || !isToastElement(toast)) {
      return;
    }

    const data = extractToastData(toast);
    logStartupDebug('handle-toast', data);
    if (shouldPassthroughStartupToast(data)) {
      const existingChip = state.sourceMap.get(toast);
      if (existingChip) {
        closeChip(existingChip);
        state.sourceMap.delete(toast);
      }
      restoreOriginalToast(toast);
      logStartupDebug('startup-passthrough', data, {
        decision: 'restore-original-toast',
        sourceRectAfterRestore: getDebugRect(toast),
      });
      state.seen.add(toast);
      return;
    }
    if (data.passthroughOriginalToast) {
      const existingChip = state.sourceMap.get(toast);
      if (existingChip) {
        closeChip(existingChip);
        state.sourceMap.delete(toast);
      }
      restoreOriginalToast(toast);
      logStartupDebug('passthrough-original', data, {
        decision: 'restore-original-toast',
        sourceRectAfterRestore: getDebugRect(toast),
      });
      state.seen.add(toast);
      return;
    }
    trackToastBurst(data);
    if (shouldThrottleToast(data)) {
      hideOriginalToast(toast);
      logStartupDebug('throttled', data, {
        decision: 'hide-original-toast',
        sourceRectAfterHide: getDebugRect(toast),
      });
      state.seen.add(toast);
      return;
    }
    if (shouldSuppressDatabaseToast(data)) {
      hideOriginalToast(toast);
      logStartupDebug('suppressed-database-toast', data, {
        decision: 'hide-original-toast',
        sourceRectAfterHide: getDebugRect(toast),
      });
      state.seen.add(toast);
      return;
    }
    if (isCompletionToast(data) && isDatabaseWorkflowToast(data)) {
      closePersistentDatabaseChips();
    }
    let chip = state.sourceMap.get(toast);
    if (!chip || !chip.isConnected) {
      chip = showChip(data);
      state.sourceMap.set(toast, chip);
      logStartupDebug('mapped-to-chip', data, {
        chipRect: getDebugRect(chip),
      });
      state.seen.add(toast);
    } else {
      updateChip(chip, data);
      logStartupDebug('updated-chip', data, {
        chipRect: getDebugRect(chip),
      });
    }
    hideOriginalToast(toast);
    logStartupDebug('original-hidden-after-chip', data, {
      sourceRectAfterHide: getDebugRect(toast),
      chipRect: getDebugRect(chip),
    });
  }

  function scanExisting() {
    observedDocuments.forEach(scanToastContainers);
  }

  function handleRemovedNode(node) {
    if (!node || node.nodeType !== 1) {
      return;
    }
    const chip = state.sourceMap.get(node);
    if (chip) {
      closeChip(chip);
    }
  }

  function startObserver() {
    if (state.observers.length) {
      return;
    }
    observedDocuments.forEach((doc) => {
      const Observer = doc.defaultView?.MutationObserver || MutationObserver;
      const observer = new Observer((mutations) => {
        const nodeCount = mutations.reduce((count, mutation) => count + mutation.addedNodes.length + mutation.removedNodes.length, 0);
        if (mutations.length > MUTATION_BURST_RECORD_LIMIT || nodeCount > MUTATION_BURST_NODE_LIMIT) {
          enterSafeMode(`mutation-burst:${mutations.length}/${nodeCount}`);
          scheduleToastContainerScan();
        }

        for (const mutation of mutations) {
          mutation.addedNodes.forEach(scanAddedNodeForToasts);

          mutation.removedNodes.forEach(handleRemovedNode);
        }
      });

      observer.observe(doc.documentElement, {
        childList: true,
        subtree: true,
      });
      state.observers.push(observer);
    });
  }

  function getAcuApi() {
    return hostWindow.AutoCardUpdaterAPI || window.AutoCardUpdaterAPI || null;
  }

  function syncAcuCheckbox(value) {
    const checkbox = hostDocument.querySelector('[id$="-auto-update-enabled-checkbox"]');
    if (checkbox && checkbox.type === 'checkbox') {
      checkbox.checked = value;
    }
  }

  function pauseAcuAutoUpdate(reason) {
    if (!state.settings.abortGuard || !/SP.?数据库|星.?数据库|增量更新|填表|终止|停止|中止|取消|abort|cancel|stop/i.test(reason || '')) {
      return;
    }
    const api = getAcuApi();
    const settings = api?.settings;
    const previous = settings?.autoUpdateEnabled !== false;
    state.acuCooldownUntil = Date.now() + 30000;
    if (settings && typeof settings === 'object') {
      settings.autoUpdateEnabled = false;
      syncAcuCheckbox(false);
    }
    hostWindow.clearTimeout(state.acuCooldownTimer);
    state.acuCooldownTimer = hostWindow.setTimeout(() => {
      if (settings && previous && settings.autoUpdateEnabled === false) {
        settings.autoUpdateEnabled = true;
        syncAcuCheckbox(true);
      }
      state.acuCooldownUntil = 0;
    }, 30000);
  }

  function patchAcuApi() {
    const api = getAcuApi();
    if (!api || api[ACU_PATCH_FLAG]) {
      state.patchedApi = api || state.patchedApi;
      return;
    }
    const originals = {};
    const wrapped = {};
    ['triggerUpdate', 'manualUpdate'].forEach((name) => {
      if (typeof api[name] !== 'function') {
        return;
      }
      originals[name] = api[name];
      wrapped[name] = function patchedAcuEntry(...args) {
        if (state.acuCooldownUntil > Date.now()) {
          const settings = getAcuApi()?.settings;
          if (settings && typeof settings === 'object') {
            settings.autoUpdateEnabled = false;
            syncAcuCheckbox(false);
          }
          return false;
        }
        return originals[name].apply(this, args);
      };
      api[name] = wrapped[name];
    });
    if (!Object.keys(originals).length) {
      return;
    }
    Object.defineProperty(api, ACU_PATCH_FLAG, {
      configurable: true,
      value: { originals, wrapped },
    });
    state.patchedApi = api;
  }

  function restoreAcuPatch() {
    const api = state.patchedApi;
    const patch = api?.[ACU_PATCH_FLAG];
    if (!api || !patch) {
      return;
    }
    Object.keys(patch.originals).forEach((name) => {
      if (api[name] === patch.wrapped[name]) {
        api[name] = patch.originals[name];
      }
    });
    try {
      delete api[ACU_PATCH_FLAG];
    } catch (_) {
      api[ACU_PATCH_FLAG] = null;
    }
  }

  function installAbortGuard() {
    if (state.abortHandler) {
      return;
    }
    state.abortHandler = (event) => {
      const button = event.target?.closest?.('.acu-toast .qrf-abort-btn, #toast-container .qrf-abort-btn, .toast-container .qrf-abort-btn');
      if (!button) {
        return;
      }
      pauseAcuAutoUpdate(cleanText(button.closest('.toast, .acu-toast, [role="alert"], [role="status"]')?.textContent || button.textContent || ''));
    };
    hostDocument.addEventListener('click', state.abortHandler, true);
  }

  function findSettingsMount() {
    const selectors = [
      '#extensions_settings2',
      '#extensions_settings',
      '#third_party_extension_settings',
      '.extensions_settings',
      '#rm_extensions_block .inline-drawer-content',
    ];
    for (const selector of selectors) {
      const node = hostDocument.querySelector(selector);
      if (node) {
        return node;
      }
    }
    return null;
  }

  function formatOffsetLabel(value) {
    const rounded = Math.round(Number(value) || 0);
    return `${rounded > 0 ? '+' : ''}${rounded}px`;
  }

  function renderNumberStepper(label, setting, { min, max, step, inputMode = 'numeric' }) {
    return `
      <label>${label}
        <div class="${PLUGIN_ID}-number-stepper">
          <button type="button" class="${PLUGIN_ID}-stepper-button" data-step-setting="${setting}" data-step-dir="-1" aria-label="减少${label}">-</button>
          <input class="text_pole" type="number" min="${min}" max="${max}" step="${step}" inputmode="${inputMode}" data-setting="${setting}">
          <button type="button" class="${PLUGIN_ID}-stepper-button" data-step-setting="${setting}" data-step-dir="1" aria-label="增加${label}">+</button>
        </div>
      </label>
    `;
  }

  function renderInlineNumberStepper(setting, { min, max, step, inputMode = 'numeric' }) {
    return `
      <div class="${PLUGIN_ID}-number-stepper ${PLUGIN_ID}-number-stepper--compact">
        <button type="button" class="${PLUGIN_ID}-stepper-button" data-step-setting="${setting}" data-step-dir="-1" aria-label="减少">-</button>
        <input class="text_pole" type="number" min="${min}" max="${max}" step="${step}" inputmode="${inputMode}" data-setting="${setting}">
        <button type="button" class="${PLUGIN_ID}-stepper-button" data-step-setting="${setting}" data-step-dir="1" aria-label="增加">+</button>
      </div>
    `;
  }

  function renderColorPresetList(panel) {
    if (!panel) {
      return;
    }
    const list = panel.querySelector('[data-preset-list]');
    if (!list) {
      return;
    }
    list.replaceChildren();
    if (!state.colorPresets.length) {
      const empty = hostDocument.createElement('div');
      empty.className = `${PLUGIN_ID}-preset-empty`;
      empty.textContent = '还没有预设。调好颜色后点上面“保存当前颜色”。';
      list.appendChild(empty);
      return;
    }
    const activeId = getActiveColorPresetId();
    state.colorPresets.forEach((preset) => {
      const row = hostDocument.createElement('div');
      row.className = `${PLUGIN_ID}-preset-item${preset.id === activeId ? ' is-active' : ''}`;

      const apply = hostDocument.createElement('button');
      apply.type = 'button';
      apply.className = `${PLUGIN_ID}-preset-apply`;
      apply.dataset.presetApply = preset.id;
      apply.title = `应用预设：${preset.name}`;

      const swatches = hostDocument.createElement('span');
      swatches.className = `${PLUGIN_ID}-preset-swatches`;
      ['infoColor', 'successColor', 'warningColor', 'errorColor', 'bgColor'].forEach((key) => {
        const dot = hostDocument.createElement('span');
        dot.className = `${PLUGIN_ID}-preset-swatch`;
        dot.style.background = preset.colors[key];
        swatches.appendChild(dot);
      });

      const label = hostDocument.createElement('span');
      label.className = `${PLUGIN_ID}-preset-label`;
      label.textContent = preset.name;

      apply.appendChild(swatches);
      apply.appendChild(label);

      const del = hostDocument.createElement('button');
      del.type = 'button';
      del.className = `${PLUGIN_ID}-preset-delete`;
      del.dataset.presetDelete = preset.id;
      del.title = `删除预设：${preset.name}`;
      del.textContent = '×';

      row.appendChild(apply);
      row.appendChild(del);
      list.appendChild(row);
    });
  }

  function renderDockPresetSwitcher() {
    const panel = state.dockPresetPanel;
    if (!panel) {
      return;
    }
    panel.replaceChildren();
    if (!state.colorPresets.length) {
      panel.classList.add('is-empty');
      return;
    }
    panel.classList.remove('is-empty');
    const title = hostDocument.createElement('div');
    title.className = `${PLUGIN_ID}-dock-presets-title`;
    title.textContent = '颜色预设';
    panel.appendChild(title);
    const activeId = getActiveColorPresetId();
    state.colorPresets.forEach((preset) => {
      const btn = hostDocument.createElement('button');
      btn.type = 'button';
      btn.className = `${PLUGIN_ID}-dock-preset${preset.id === activeId ? ' is-active' : ''}`;
      btn.dataset.presetApply = preset.id;
      btn.title = `切换到：${preset.name}`;
      const dot = hostDocument.createElement('span');
      dot.className = `${PLUGIN_ID}-dock-preset-dot`;
      dot.style.background = preset.colors.infoColor;
      const label = hostDocument.createElement('span');
      label.className = `${PLUGIN_ID}-dock-preset-label`;
      label.textContent = preset.name;
      btn.appendChild(dot);
      btn.appendChild(label);
      panel.appendChild(btn);
    });
  }

  function renderSettingsPanel(panel) {
    panel.innerHTML = `
      <div class="inline-drawer">
        <div class="inline-drawer-toggle inline-drawer-header">
          <b>酒馆提示框美化</b>
          <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
        </div>
        <div class="inline-drawer-content">
          <div class="${PLUGIN_ID}-switch-row">
            <label><input type="checkbox" data-setting="enabled"><span>启用提示</span></label>
            <label><input type="checkbox" data-setting="popupSkin"><span>美化弹窗</span></label>
            <label><input type="checkbox" data-setting="abortGuard"><span>停止保护</span></label>
            <label><input type="checkbox" data-setting="inputDock"><span>输入框横条</span></label>
            <label><input type="checkbox" data-setting="immersiveMode"><span>沉浸显示</span></label>
            <label><input type="checkbox" data-setting="edgeDockEnabled"><span>边缘收纳</span></label>
            <label><input type="checkbox" data-setting="edgeDockDropCapture"><span>拖放收纳</span></label>
            <label><input type="checkbox" data-setting="centerDebug"><span>定位调试</span></label>
          </div>
          <div class="${PLUGIN_ID}-settings-grid">
            <label>提示色<input type="color" data-setting="infoColor"></label>
            <label>成功色<input type="color" data-setting="successColor"></label>
            <label>警告色<input type="color" data-setting="warningColor"></label>
            <label>错误色<input type="color" data-setting="errorColor"></label>
            <label>背景色<input type="color" data-setting="bgColor"></label>
            <label>文字色<input type="color" data-setting="textColor"></label>
            <label>对号色<input type="color" data-setting="checkboxTickColor"></label>
            <label>加载特效
              <select data-setting="loadingFx">
                <option value="off">关闭</option>
                <option value="starwarp">星轨折跃</option>
              </select>
            </label>
            <label>收纳位置
              <select data-setting="edgeDockPosition">
                <option value="right">右侧</option>
                <option value="left">左侧</option>
                <option value="top">顶部菜单下方</option>
                <option value="bottom">底部</option>
              </select>
            </label>
            <label>
              <span class="${PLUGIN_ID}-slider-head"><span>收纳边距</span><span class="${PLUGIN_ID}-slider-value" data-setting-value="edgeDockEdgeOffset"></span></span>
              <div class="${PLUGIN_ID}-slider-row">
                <input type="range" min="-80" max="120" step="1" data-setting="edgeDockEdgeOffset">
                ${renderInlineNumberStepper('edgeDockEdgeOffset', { min: -80, max: 120, step: 1 })}
              </div>
            </label>
            ${renderNumberStepper('缩放', 'scale', { min: 0.72, max: 1.8, step: 0.05, inputMode: 'decimal' })}
            ${renderNumberStepper('框宽度', 'maxWidth', { min: 260, max: 980, step: 10 })}
            ${renderNumberStepper('标题宽度', 'titleWidth', { min: 60, max: 260, step: 10 })}
            ${renderNumberStepper('堆叠数量', 'maxStack', { min: 1, max: 8, step: 1 })}
            ${renderNumberStepper('停留时间', 'duration', { min: 900, max: 12000, step: 100 })}
            ${renderNumberStepper('错误停留', 'errorDuration', { min: 1200, max: 18000, step: 100 })}
            ${renderNumberStepper('顶部偏移', 'topOffset', { min: 0, max: 180, step: 1 })}
            <label>
              <span class="${PLUGIN_ID}-slider-head"><span>X 偏移</span><span class="${PLUGIN_ID}-slider-value" data-setting-value="offsetX"></span></span>
              <div class="${PLUGIN_ID}-slider-row">
                <input type="range" min="-520" max="520" step="1" data-setting="offsetX">
                ${renderInlineNumberStepper('offsetX', { min: -520, max: 520, step: 1 })}
              </div>
            </label>
            <label>
              <span class="${PLUGIN_ID}-slider-head"><span>Y 偏移</span><span class="${PLUGIN_ID}-slider-value" data-setting-value="offsetY"></span></span>
              <div class="${PLUGIN_ID}-slider-row">
                <input type="range" min="-260" max="260" step="1" data-setting="offsetY">
                ${renderInlineNumberStepper('offsetY', { min: -260, max: 260, step: 1 })}
              </div>
            </label>
          </div>
          <div class="${PLUGIN_ID}-preset-block">
            <div class="${PLUGIN_ID}-preset-head">颜色预设</div>
            <div class="${PLUGIN_ID}-preset-save-row">
              <input class="text_pole ${PLUGIN_ID}-preset-name" type="text" data-preset-name maxlength="20" placeholder="预设名称（可留空）">
              <button class="menu_button" type="button" data-action="preset-save">保存当前颜色</button>
            </div>
            <div class="${PLUGIN_ID}-preset-list" data-preset-list></div>
          </div>
          <div class="${PLUGIN_ID}-settings-note" data-dock-summary></div>
          <div class="${PLUGIN_ID}-settings-actions">
            <button class="menu_button" type="button" data-action="test">测试</button>
            <button class="menu_button" type="button" data-action="test-loading">测试加载</button>
            <button class="menu_button" type="button" data-action="reset">重置</button>
          </div>
        </div>
      </div>
    `;
  }

  function syncSettingsPanel(panel = hostDocument.getElementById(PANEL_ID)) {
    if (!panel || !state.settings) {
      return;
    }
    Object.entries(state.settings).forEach(([key, value]) => {
      const inputs = Array.from(panel.querySelectorAll(`[data-setting="${key}"]`));
      if (!inputs.length) {
        return;
      }
      inputs.forEach((input) => {
        if (input.type === 'checkbox') {
          input.checked = !!value;
        } else if (input.value !== String(value)) {
          input.value = String(value);
        }
      });
    });
    const offsetX = panel.querySelector('[data-setting-value="offsetX"]');
    if (offsetX) {
      offsetX.textContent = formatOffsetLabel(state.settings.offsetX);
    }
    const offsetY = panel.querySelector('[data-setting-value="offsetY"]');
    if (offsetY) {
      offsetY.textContent = formatOffsetLabel(state.settings.offsetY);
    }
    const edgeDockEdgeOffset = panel.querySelector('[data-setting-value="edgeDockEdgeOffset"]');
    if (edgeDockEdgeOffset) {
      edgeDockEdgeOffset.textContent = formatOffsetLabel(state.settings.edgeDockEdgeOffset);
    }
    const dockSummary = panel.querySelector('[data-dock-summary]');
    if (dockSummary) {
      const count = state.dockItems.length;
      dockSummary.textContent = state.settings.edgeDockEnabled
        ? `${state.settings.edgeDockDropCapture ? '拖放收纳开启：可直接把图标拖到收纳条附近吸附。' : '拖放收纳关闭：不会再自动吸入新元素，已收纳按钮仍可往外拖开释放。'}长按收纳条可以微调上下或左右位置。当前已收纳 ${count} 个按钮。`
        : `开启边缘收纳后，可直接把图标拖到收纳条附近收纳。`;
    }
    renderColorPresetList(panel);
  }

  function commitSettingChange(key, value, panel, options = {}) {
    if (!key) {
      return;
    }
    const previousBgColor = state.settings.bgColor;
    const previousAutoTickColor = getAutoCheckboxTickColor(previousBgColor);
    const shouldFollowAutoTickColor = key === 'bgColor'
      && normalizeColor(state.settings.checkboxTickColor, previousAutoTickColor) === previousAutoTickColor;

    state.settings[key] = value;
    state.settings = normalizeSettings(state.settings);
    if (key === 'edgeDockEnabled' && state.settings.edgeDockEnabled) {
      state.dockOpen = true;
    }
    if (key === 'edgeDockEdgeOffset') {
      applyEdgeDockPosition();
      hostWindow.requestAnimationFrame(() => alignDockElements());
      saveSettings();
      syncSettingsPanel(panel);
      return;
    }
    if (shouldFollowAutoTickColor) {
      state.settings.checkboxTickColor = getAutoCheckboxTickColor(state.settings.bgColor);
    }
    if (options.light === true && COLOR_SETTING_KEYS.has(key)) {
      applyThemeVariables();
      scheduleSaveSettings();
      return;
    }
    applySettings();
    saveSettings();
    syncSettingsPanel(panel);
  }

  function stepSettingsNumber(input, direction, panel) {
    if (!input) {
      return;
    }
    const key = input.dataset.setting;
    const step = Number(input.step || 1) || 1;
    const min = input.min === '' ? -Infinity : Number(input.min);
    const max = input.max === '' ? Infinity : Number(input.max);
    const current = Number(input.value || state.settings?.[key] || 0);
    const precision = Math.max(
      String(input.step || '').split('.')[1]?.length || 0,
      String(current).split('.')[1]?.length || 0,
    );
    const next = clamp(current + (step * direction), min, max, current);
    commitSettingChange(key, Number(next.toFixed(precision)), panel);
  }

  function bindSettingsPanel(panel) {
    if (panel.dataset.zutBound === 'true') {
      syncSettingsPanel(panel);
      return;
    }
    panel.dataset.zutBound = 'true';
    panel.querySelectorAll('[data-setting]').forEach((input) => {
      if (input.type === 'color') {
        input.addEventListener('input', () => {
          commitSettingChange(input.dataset.setting, input.value, panel, { light: true });
        });
        input.addEventListener('change', () => {
          commitSettingChange(input.dataset.setting, input.value, panel);
        });
        return;
      }
      const eventName = input.tagName === 'SELECT' || input.type === 'checkbox' ? 'change' : 'input';
      input.addEventListener(eventName, () => {
        const key = input.dataset.setting;
        if (!key) {
          return;
        }
        const shouldRequestImmersive = key === 'immersiveMode' && input.type === 'checkbox' && input.checked;
        let value;
        if (input.type === 'checkbox') {
          value = input.checked;
        } else if (input.type === 'number' || input.type === 'range') {
          value = Number(input.value);
        } else {
          value = input.value;
        }
        commitSettingChange(key, value, panel);
        if (shouldRequestImmersive) {
          syncImmersiveMode(true);
        }
      });
    });

    panel.querySelectorAll('[data-step-setting]').forEach((button) => {
      button.addEventListener('click', () => {
        const key = button.dataset.stepSetting;
        const direction = Number(button.dataset.stepDir || 1) < 0 ? -1 : 1;
        const input = Array.from(panel.querySelectorAll('input[type="number"][data-setting]'))
          .find((candidate) => candidate.dataset.setting === key);
        stepSettingsNumber(input, direction, panel);
      });
    });

    panel.querySelector('[data-action="reset"]')?.addEventListener('click', () => {
      state.settings = normalizeSettings();
      applySettings();
      saveSettings();
      syncSettingsPanel(panel);
    });

    panel.querySelector('[data-action="test"]')?.addEventListener('click', () => {
      showChip({
        type: 'info',
        title: '测试提示',
        message: '测试消息',
        actionButton: null,
        actionText: '',
      });
    });

    panel.querySelector('[data-action="test-loading"]')?.addEventListener('click', () => {
      const chip = showChip({
        type: 'info',
        title: '加载提示',
        message: '正在处理，请稍候...',
        actionButton: { click() {} },
        actionText: '中止',
      });
      hostWindow.setTimeout(() => closeChip(chip), 4200);
    });

    panel.querySelector('[data-action="preset-save"]')?.addEventListener('click', () => {
      const nameInput = panel.querySelector('[data-preset-name]');
      addColorPreset(nameInput?.value || '');
      if (nameInput) {
        nameInput.value = '';
      }
    });

    panel.querySelector('[data-preset-name]')?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        const nameInput = panel.querySelector('[data-preset-name]');
        addColorPreset(nameInput?.value || '');
        if (nameInput) {
          nameInput.value = '';
        }
      }
    });

    panel.querySelector('[data-preset-list]')?.addEventListener('click', (event) => {
      const applyId = event.target?.closest?.('[data-preset-apply]')?.dataset?.presetApply;
      if (applyId) {
        applyColorPreset(applyId);
        return;
      }
      const deleteId = event.target?.closest?.('[data-preset-delete]')?.dataset?.presetDelete;
      if (deleteId) {
        removeColorPreset(deleteId);
      }
    });

    syncSettingsPanel(panel);
  }

  function ensureSettingsPanel() {
    const mount = findSettingsMount();
    if (!mount) {
      hostWindow.clearTimeout(state.settingsRetryTimer);
      state.settingsRetryTimer = hostWindow.setTimeout(ensureSettingsPanel, 1800);
      return;
    }

    let panel = hostDocument.getElementById(PANEL_ID);
    if (!panel) {
      panel = hostDocument.createElement('section');
      panel.id = PANEL_ID;
      panel.className = `${PLUGIN_ID}-settings`;
      renderSettingsPanel(panel);
      mount.appendChild(panel);
    }
    bindSettingsPanel(panel);
  }

  function cleanup() {
    state.observers.forEach((observer) => observer.disconnect());
    state.observers = [];
    state.active.forEach((chip) => {
      hostWindow.clearTimeout(Number(chip.dataset.zutTimer || 0));
      chip.remove();
    });
    state.active = [];
    state.hiddenSources.forEach(restoreOriginalToast);
    state.hiddenSources.clear();
    hostWindow.clearTimeout(state.settingsRetryTimer);
    hostWindow.clearTimeout(state.settingsSaveTimer);
    hostWindow.clearTimeout(state.acuCooldownTimer);
    hostWindow.clearTimeout(state.toastContainerScanTimer);
    state.toastContainerScanTimer = null;
    hostWindow.clearTimeout(state.dockLaunchTimer);
    hostWindow.clearTimeout(state.dockSyncTimer);
    cleanupInputDock();
    cleanupImmersiveMode();
    cleanupEdgeDock();
    if (typeof state.ciIslandCleanup === 'function') {
      state.ciIslandCleanup();
    }
    restoreAcuPatch();
    if (state.resizeHandler) {
      hostWindow.removeEventListener('resize', state.resizeHandler);
      hostWindow.removeEventListener('scroll', state.resizeHandler);
      state.resizeHandler = null;
    }
    if (state.abortHandler) {
      hostDocument.removeEventListener('click', state.abortHandler, true);
      state.abortHandler = null;
    }
    hostDocument.getElementById(STYLE_ID)?.remove();
    hostDocument.getElementById(LAYER_ID)?.remove();
    hostDocument.getElementById(PANEL_ID)?.remove();
    hostDocument.documentElement.classList.remove(`${PLUGIN_ID}-popup-on`);
    hostDocument.documentElement.classList.remove(`${PLUGIN_ID}-gsap-toast-on`);
    hostDocument.documentElement.classList.remove(`${PLUGIN_ID}-immersive-on`);
    [
      '--zut-info-accent',
      '--zut-success-accent',
      '--zut-warning-accent',
      '--zut-error-accent',
      '--zut-bg-rgb',
      '--zut-text-color',
      '--zut-checkbox-tick-color',
      '--zut-chip-max-width',
      '--zut-title-max-width',
      '--zut-chip-padding-y',
      '--zut-chip-padding-x',
      '--zut-chip-gap',
      '--zut-chip-radius',
      '--zut-chip-font-size',
      '--zut-button-pad-y',
      '--zut-button-pad-x',
      '--zut-dot-size',
    ].forEach((name) => hostDocument.documentElement.style.removeProperty(name));
    hostWindow.__zmerUniversalToastThemeCleanup = null;
    window.__zmerUniversalToastThemeCleanup = null;
  }

  function init() {
    state.startedAt = Date.now();
    state.settings = loadSettings();
    state.dockItems = loadDockItems();
    state.colorPresets = loadColorPresets();
    injectStyle();
    ensureGsap();
    applySettings();
    ensureLayer();
    scanExisting();
    startObserver();
    ensureSettingsPanel();
    startCiIslandEdgeMode();
    state.resizeHandler = () => {
      layoutChips();
      if (state.settings?.edgeDockEnabled) {
        renderEdgeDock();
        hostWindow.requestAnimationFrame(() => {
          applyEdgeDockPosition();
          alignDockElements();
        });
        scheduleDockSync(0);
      }
      syncCiIslandDockState();
    };
    hostWindow.addEventListener('resize', state.resizeHandler, { passive: true });
    hostWindow.addEventListener('scroll', state.resizeHandler, { passive: true });
    hostWindow.__zmerUniversalToastThemeCleanup = cleanup;
    window.__zmerUniversalToastThemeCleanup = cleanup;
    console.log('[酒馆提示框美化][startup-debug] ready', {
      debugWindowMs: STARTUP_DEBUG_WINDOW,
      gsapToast: !!isGsapToastMode(),
    });
    console.log('[酒馆提示框美化] loaded');
  }

  if (hostDocument.readyState === 'loading') {
    hostDocument.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
