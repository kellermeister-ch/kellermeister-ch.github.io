// This is the entry file used in createHtmlPlugin of vite.config.ts.

import "soukai-bis/patch-zod";
import {getBuildVersion} from './utils.ts';
// Routing
import {initRouter} from './router.ts';
import {IndexedDBEngine, setEngine, setNamespace} from "soukai-bis";
import {bootSoukaiModels} from "../soukai/bootModels.ts";
import {CDI} from "../cdi/CDI.ts";
import {ConnectivityMonitor} from "../solid/ConnectivityMonitor.ts";
import './components/sync-progress-dialog.ts';
import type {UpdateBanner} from './components/update-banner.ts';
import './components/update-banner.ts';
import {registerSW} from 'virtual:pwa-register';

// How often an open app asks the server for a new service worker (a new version).
const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;


// ife for bootstrapping
void (async () => {

    // Output build version
    console.info(`Kellermeister Version: ${getBuildVersion()}`);

    // App update: a new version waits until the user accepts it in the banner
    // (registerType 'prompt'); updateSW(true) activates it and reloads every
    // open tab. The browser looks for a new service worker only on a full
    // navigation, which a single-page app rarely does, so also check hourly and
    // whenever the app comes back to the foreground.
    const updateBanner = document.body.appendChild(document.createElement('update-banner')) as UpdateBanner;
    const updateSW = registerSW({
        immediate: true,
        onNeedRefresh() {
            updateBanner.show(() => void updateSW(true));
        },
        onRegisteredSW(_swUrl, registration) {
            if (!registration) {
                return;
            }
            const checkForUpdate = () => {
                if (navigator.onLine) {
                    void registration.update();
                }
            };
            setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL_MS);
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') {
                    checkForUpdate();
                }
            });
        },
    });

    // Local-first: the global engine is IndexedDB, so all ordinary reads/writes
    // are local and offline-capable. The Pod is reached only by the sync layer
    // via a scoped `runWithEngine(SolidEngine, …)`.
    // soukai-bis names the IndexedDB database after the global namespace (the
    // constructor no longer takes a name), so set it before creating the engine.
    setNamespace("kellermeister");
    bootSoukaiModels();
    setEngine(new IndexedDBEngine());

    try {
        // initialize router
        await initRouter(document.querySelector('kellermeister-app')!);
    } catch (e) {
        console.error('Could not initialize application.', e);
    }

    // The sync progress dialog sits beside the router outlet, so it survives
    // route changes and shows on every page (incl. the post-login sync below).
    document.body.appendChild(document.createElement('sync-progress-dialog'));

    // Restore any existing Solid session (login is NOT required to use the app).
    await CDI.getInstance().getSolidService().restoreSession();

    // Post-login synchronization: run the sync the user asked for before being
    // sent through the OIDC login flow (pressing Sync while logged out). Only a
    // remembered request triggers a sync — a plain reload does not.
    void CDI.getInstance().getPendingSync().run();

    // On reconnect, complete a remembered sync — a sync the user asked for that
    // could not run because the device was offline (or logged out). Coming back
    // online never syncs on its own.
    const connectivity = new ConnectivityMonitor(() => CDI.getInstance().getPendingSync().run());
    connectivity.start();
})();

// This is needed because of the isolatedModules flag in tsconfig.json
// @see https://vitejs.dev/guide/features.html#typescript-compiler-options
export {};