import {css, html} from 'lit';
import {customElement, property, state} from 'lit/decorators.js';
import {Task} from '@lit/task';
import {Router} from "@vaadin/router";
import {EVENTS, getDefaultSession, Session} from "@inrupt/solid-client-authn-browser";
import {router} from "../router.ts";
import {BasePage} from "../common/base-page.ts";
import {CDI} from "../../cdi/CDI.ts";
import {resolveKellermeisterContainer} from "../../solid/podContainerResolution.ts";
import type {WebIDProfile} from "../../../domain/Solid/WebIDProfile.ts";
import '../components/kellermeister-button.ts';
import '../components/kellermeister-header.ts';
import '../components/kellermeister-footer.ts';
import '../components/sync-status.ts';
import type {Cellar} from "../../../domain/Cellar/Cellar.ts";
import {shouldRememberSync, syncFailureAction} from "../sync-ui-action.ts";
import type {SyncStatus} from "../../../application/sync/SyncCoordinator.ts";
import {formatLastSync} from "../components/sync-status-format.ts";

@customElement('landing-page')
class LandingPage extends BasePage {

    private static readonly WEBID_HISTORY_KEY = 'kellermeister_webid_history';

    @property()
    session: Session = getDefaultSession();

    @property()
    isLoggedIn: boolean = this.session.info.isLoggedIn;

    @state()
    private showWebIdDialog: boolean = false;

    @state()
    private webIdInput: string = '';

    @state()
    private webIdSelected: string = '__new__';

    @state()
    private webIdHistory: string[] = [];

    @state()
    private webIdError: string = '';

    @state()
    private webIdLoading: boolean = false;

    @state()
    private showImageLightbox: boolean = false;

    /** The WebID awaiting a wipe confirmation, with the identity it replaces. */
    @state()
    private switchToConfirm: {webId: string; previousWebId: string} | null = null;

    @state()
    private status: SyncStatus = {state: "idle", lastSyncedAt: null, error: null, progress: null};

    private _webIdResolve: ((profile: WebIDProfile | null) => void) | null = null;
    private _switchResolve: ((confirmed: boolean) => void) | null = null;

    private cdi: CDI = CDI.getInstance();
    private unsubscribe: (() => void) | null = null;

    private _cellarsTask = new Task(this, async () => {
        return await this.cdi.getKellermeisterService().getCellars();
    });

    constructor() {
        super();
    }


    private loadWebIdHistory(): string[] {
        try {
            const stored = localStorage.getItem(LandingPage.WEBID_HISTORY_KEY);
            return stored ? JSON.parse(stored) : [];
        } catch {
            return [];
        }
    }

    private saveWebIdToHistory(webId: string) {
        const history = this.loadWebIdHistory().filter(id => id !== webId);
        history.unshift(webId);
        localStorage.setItem(LandingPage.WEBID_HISTORY_KEY, JSON.stringify(history));
    }

    connectedCallback() {
        this.unsubscribe = this.cdi.getSyncCoordinator().onStatusChange((status) => {
            // A finished sync may have pulled cellars in from the Pod (and has
            // dropped the service's caches), so re-read them.
            const syncFinished = this.status.state === "syncing" && status.state !== "syncing";
            this.status = status;
            if (syncFinished) {
                this.loadCellars();
            }
        });
        super.connectedCallback();
        console.log("connectedCallback: logged in", this.isLoggedIn);

        this.session.events.on(EVENTS.LOGIN, () => {
            console.log("connectedCallback: on EVENTS.LOGIN");
            this.sessionChangedCallback(getDefaultSession());
        });
        this.session.events.on(EVENTS.SESSION_RESTORED, () => {
            console.log("connectedCallback: on EVENTS.SESSION_RESTORED");
            this.sessionChangedCallback(getDefaultSession());
        });
        this.session.events.on(EVENTS.LOGOUT, () => {
            console.log("connectedCallback: on EVENTS.LOGOUT");
            this.sessionChangedCallback(getDefaultSession());
        });
        this.loadCellars();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this.unsubscribe?.();
        this.unsubscribe = null;
    }

    async sessionChangedCallback(session: Session) {
        if (session.info.isLoggedIn && session.info.webId != null) {
            console.log("sessionChangedCallback: fetched user session with WebId:", session.info.webId);
            // Authoritative identity check, BEFORE the session is used (before the
            // container is resolved and before any sync): the identity provider may
            // authenticate a WebID other than the one typed, and a restored session
            // never passes through the login dialog. This also records the WebID —
            // it must NOT be written independently, or the next switch would be
            // undetectable.
            if (!await this.adoptIdentity(session.info.webId)) {
                return;
            }
            const webIDProfile: WebIDProfile | null = await this.cdi.getSolidService().getWebIDProfile(new URL(session.info.webId));
            if (webIDProfile) {
                if (webIDProfile.getStorageUrls().length === 1) {
                    this.session = session;
                    this.isLoggedIn = session.info.isLoggedIn;
                    // Resolve (provision if missing) the Pod container. This does
                    // NOT sync: a restored session is not a request to sync, so a
                    // reload stays local. Only a remembered request (the user
                    // pressed Sync, which sent them through login) runs here —
                    // this is where a first login first learns the container base.
                    const storageRoot = webIDProfile.getStorageUrls()[0].toString();
                    const base = await resolveKellermeisterContainer(
                        storageRoot,
                        this.cdi.getSolidService().getAuthenticatedFetch(),
                        () => this.cdi.getCellarRepository().ensureWellKnownCellars(),
                    );
                    this.cdi.setPodContainerBase(base);
                    await this.cdi.getPendingSync().run();
                    this.loadCellars();
                }
                else if (webIDProfile.getStorageUrls().length === 0) {
                    alert("Das WebID Profil enthält keine Storage URL.");
                    this.cdi.getSolidService().logout();
                } else {
                    alert("Das WebID Profil enthält mehrere Storage URLs: " + webIDProfile.getStorageUrls());
                    this.cdi.getSolidService().logout();
                }
             } else {
                console.log("sessionChangedCallback: failed to find storage");
                alert("No storage found in Pod, you will not be able to store any data.");
                this.cdi.getSolidService().logout();
                Router.go(router.urlForName('landing-page'));
            }
        } else {
            this.isLoggedIn = false;
            console.log("sessionChangedCallback: logout");
            Router.go(router.urlForName('landing-page'));
        }
    }

    loadCellars() {
        // Local-first: cellars live in IndexedDB and are available with or
        // without a Solid session.
        this._cellarsTask.run();
    }

    render() {
        return html`
            ${this.showImageLightbox ? html`
                <div class="lightbox-overlay" @click="${() => this.showImageLightbox = false}">
                    <img class="lightbox-img" src="/Prozess_Foto.png" />
                </div>
            ` : ''}
            ${this.switchToConfirm ? html`
                <div class="dialog-overlay" @click="${this.handleSwitchCancel}">
                    <div class="dialog" role="dialog" aria-modal="true" aria-label="Andere WebID" @click="${(e: Event) => e.stopPropagation()}">
                        <h2>Andere WebID</h2>
                        <p>
                            Auf diesem Gerät wurde zuletzt <strong>${this.switchToConfirm.previousWebId}</strong> verwendet.
                            Beim Anmelden mit einer anderen WebID werden alle lokal gespeicherten Daten
                            (Keller, Flaschen, Weine, Einkäufe) auf diesem Gerät gelöscht.
                        </p>
                        <p>
                            Daten, die noch nicht mit dem Pod von ${this.switchToConfirm.previousWebId} synchronisiert
                            wurden, sind danach unwiederbringlich verloren. Brich ab, wenn du zuerst synchronisieren willst.
                        </p>
                        <div class="dialog-actions">
                            <button class="dialog-btn dialog-btn-cancel" @click="${this.handleSwitchCancel}">Abbrechen</button>
                            <button class="dialog-btn dialog-btn-ok" @click="${this.handleSwitchConfirm}">Daten löschen und anmelden</button>
                        </div>
                    </div>
                </div>
            ` : ''}
            ${this.showWebIdDialog ? html`
                <div class="dialog-overlay" @click="${this.handleWebIdCancel}">
                    <div class="dialog" role="dialog" aria-modal="true" aria-label="WebID eingeben" @click="${(e: Event) => e.stopPropagation()}">
                        <h2>WebID eingeben</h2>
                        <p>Bitte gib deine WebID ein, um dich anzumelden.</p>
                        ${this.webIdHistory.length > 0 ? html`
                            <select
                                class="dialog-select"
                                .value="${this.webIdSelected}"
                                @change="${(e: Event) => this.webIdSelected = (e.target as HTMLSelectElement).value}"
                                ?disabled="${this.webIdLoading}"
                            >
                                ${this.webIdHistory.map(id => html`<option value="${id}">${id}</option>`)}
                                <option value="__new__">— Neue WebID eingeben —</option>
                            </select>
                        ` : ''}
                        ${this.webIdSelected === '__new__' ? html`
                            <input
                                class="dialog-input"
                                type="url"
                                .value="${this.webIdInput}"
                                @input="${(e: InputEvent) => this.webIdInput = (e.target as HTMLInputElement).value}"
                                @keydown="${(e: KeyboardEvent) => e.key === 'Enter' && this.handleWebIdOk()}"
                                placeholder="z.B. https://mypod.example/profile/card#me"
                                ?disabled="${this.webIdLoading}"
                                ?autofocus="${this.webIdHistory.length === 0}"
                            />
                        ` : ''}
                        ${this.webIdError ? html`<p class="dialog-error">${this.webIdError}</p>` : ''}
                        <div class="dialog-actions">
                            <button class="dialog-btn dialog-btn-cancel" @click="${this.handleWebIdCancel}" ?disabled="${this.webIdLoading}">Abbrechen</button>
                            <button class="dialog-btn dialog-btn-ok" @click="${this.handleWebIdOk}" ?disabled="${this.webIdLoading}">
                                ${this.webIdLoading ? 'Prüfe...' : 'OK'}
                            </button>
                        </div>
                    </div>
                </div>
            ` : ''}
            <kellermeister-header>Kellermeister
                <kellermeister-button icon="search" text="Suche" @click="${this.handleSearchClick}" slot="actions" data-testid="new-cellar-button" size="small"></kellermeister-button>
            </kellermeister-header>
            <main>
                <div class="cellar-grid">
                    ${this._cellarsTask.render({
                        pending: () => html`<div class="spinner"></div>`,
                        complete: (cellars) => html`
                            ${cellars.map(cellar => html`
                                <kellermeister-button text="${this.cellarName(cellar)}" @click="${() => this.handleCellarClick(cellar.getId())}" ghost icon="${this.cellarIconName(cellar.getId())}"></kellermeister-button>
                            `)}
                            <kellermeister-button text="${this.syncLabel()}" @click="${this.handleSyncClick}" ?disabled="${this.status.state === "syncing"}" ghost icon="sync"></kellermeister-button>
                        `,
                    })}
                </div>
            </main>
            <kellermeister-footer></kellermeister-footer>
        `
    }

    private syncLabel(): string {
        switch (this.status.state) {
            case "syncing":
                return "Synchronisiert…";
            case "error":
                return "Fehler";
            default:
                return this.status.lastSyncedAt ? `Sync - ${formatLastSync(this.status.lastSyncedAt)}` : "Sync - Nur lokal";
        }
    }

    private handleSearchClick() {
        Router.go(router.urlForName('search-page'));
    }

    private async handleLoginClick() {
        console.log("handleLoginClick: session info is logged in:", getDefaultSession().info.isLoggedIn);
        if (getDefaultSession().info.isLoggedIn) {
            this.session = getDefaultSession();
            return;
        }
        const webIDProfile: WebIDProfile | null = await this.getWebID();
        console.log("webIDProfile:", webIDProfile);
        if (webIDProfile) {
            this.cdi.getSolidService().login(webIDProfile.getIssuerUrls()[0]);
        }
    }

    private getWebID(): Promise<WebIDProfile | null> {
        this.webIdHistory = this.loadWebIdHistory();
        this.webIdSelected = this.webIdHistory.length > 0 ? this.webIdHistory[0] : '__new__';
        this.webIdInput = '';
        this.webIdError = '';
        this.webIdLoading = false;
        this.showWebIdDialog = true;
        return new Promise((resolve) => {
            this._webIdResolve = resolve;
        });
    }

    /**
     * Ask whether the local data of `previousWebId` may be deleted so `webId`
     * can be adopted. Resolves false when the user cancels or dismisses.
     */
    private confirmIdentitySwitch(webId: string, previousWebId: string): Promise<boolean> {
        this.switchToConfirm = {webId, previousWebId};
        return new Promise((resolve) => {
            this._switchResolve = resolve;
        });
    }

    private handleSwitchConfirm() {
        this.switchToConfirm = null;
        this._switchResolve?.(true);
        this._switchResolve = null;
    }

    private handleSwitchCancel() {
        this.switchToConfirm = null;
        this._switchResolve?.(false);
        this._switchResolve = null;
    }

    private async handleWebIdOk() {
        const input = (this.webIdSelected === '__new__' ? this.webIdInput : this.webIdSelected).trim();
        if (!input) {
            this.webIdError = 'Bitte gib deine WebID ein.';
            return;
        }
        this.webIdLoading = true;
        this.webIdError = '';
        try {
            const webID = new URL(input);
            const profile = await this.cdi.getSolidService().getWebIDProfile(webID);
            if (profile) {
                this.saveWebIdToHistory(input);
                this.showWebIdDialog = false;
                // The chosen WebID is known here, BEFORE the OIDC redirect
                // navigates away — the only point where the warning is genuinely
                // in advance. Cancelling starts no login and touches nothing.
                if (!await this.confirmIdentitySwitchIfNeeded(input)) {
                    this._webIdResolve?.(null);
                    this._webIdResolve = null;
                    return;
                }
                this._webIdResolve?.(profile);
                this._webIdResolve = null;
            } else {
                this.webIdError = `Kein WebID Profil Dokument gefunden. Ist "${input}" wirklich deine WebID?`;
            }
        } catch (e) {
            if (e instanceof TypeError) {
                this.webIdError = 'Ungültige URL. Bitte gib eine gültige WebID ein.';
            } else {
                this.webIdError = `Fehler beim Laden des WebID Profils.`;
            }
            console.log("handleWebIdOk: failed with error:", e);
        } finally {
            this.webIdLoading = false;
        }
    }

    /**
     * Adopt `webId` as this device's identity, wiping the previous identity's
     * local data first if it differs. Returns whether the session may be used.
     *
     * A wipe leaves every in-memory holder stale — CDI's eagerly built
     * repositories, the cellar bootstrap promise, the service's cached read
     * models, the container registry — so the page is reloaded rather than
     * re-initialised by hand: the startup path is the one exercised on every
     * visit. Cancelling does NOT adopt the session: log out and keep the data.
     */
    private async adoptIdentity(webId: string): Promise<boolean> {
        const appState = this.cdi.getAppStateStore();
        const check = await this.cdi.getSwitchIdentity().check(webId);
        if (check.kind === "proceed") {
            // Drop any confirmation left over for a WebID that was never adopted
            // (e.g. the provider authenticated someone else), so it cannot
            // suppress the warning for a real switch to that WebID later.
            if (await appState.getConfirmedIdentitySwitch()) {
                await appState.setConfirmedIdentitySwitch(null);
            }
            await this.cdi.getSwitchIdentity().switchTo(webId);
            return true;
        }
        const alreadyConfirmed = await appState.getConfirmedIdentitySwitch() === webId;
        if (!alreadyConfirmed && !await this.confirmIdentitySwitch(webId, check.previousWebId)) {
            await appState.setConfirmedIdentitySwitch(null);
            this.cdi.getSolidService().logout();
            return false;
        }
        try {
            await this.cdi.getSwitchIdentity().switchTo(webId);
        } catch (error) {
            // The wipe can fail while another tab of the app holds the local
            // database open. Adopting the session anyway would show the previous
            // identity's data to the new one, so refuse and say why.
            console.error("adoptIdentity: wiping the local data failed", error);
            alert("Die lokalen Daten konnten nicht gelöscht werden. Bitte schliesse andere offene Tabs von Kellermeister und melde dich erneut an.");
            this.cdi.getSolidService().logout();
            return false;
        }
        window.location.reload();
        return false; // the reload takes over; do not continue with stale state
    }

    /**
     * Warn about (and confirm) a WebID switch before it happens. Returns whether
     * to go ahead. A confirmation is remembered against that WebID so the
     * session-establishment check does not ask again after the OIDC redirect.
     */
    private async confirmIdentitySwitchIfNeeded(webId: string): Promise<boolean> {
        const check = await this.cdi.getSwitchIdentity().check(webId);
        if (check.kind === "proceed") {
            return true;
        }
        const confirmed = await this.confirmIdentitySwitch(webId, check.previousWebId);
        if (confirmed) {
            await this.cdi.getAppStateStore().setConfirmedIdentitySwitch(webId);
        }
        return confirmed;
    }

    private cellarIconName(cellarId: string): string {
        if (cellarId === this.cdi?.getKellermeisterService().getCellarWorkId()) {
            return "work";
        } else if (cellarId === this.cdi?.getKellermeisterService().getAltglassId()) {
            return "trash";
        } else {
            return "cellar";
        }
    }

    private cellarName(cellar: Cellar): string {
        if (cellar.getId() === this.cdi?.getKellermeisterService().getCellarWorkId()) {
            return "Eingang";
        } else {
            return cellar.getName() as string;
        }
    }

    private handleWebIdCancel() {
        this.showWebIdDialog = false;
        this._webIdResolve?.(null);
        this._webIdResolve = null;
    }

    private async handleCellarClick(cellarId: string) {
        // Every cellar — including the well-known cellarwork cellar — opens to its
        // normal bottle view. The cellarwork cellar's work display is a drill-in
        // from the "Kellerarbeit" action in the cellar view's header.
        Router.go(router.urlForName('cellar-page', {cellarId: cellarId}));
    }

    private async handleSyncClick(): Promise<void> {
        console.log("handleSyncClick: session info is logged in:", getDefaultSession().info.isLoggedIn);

        try {
            await this.cdi.getSyncCoordinator().requestSync("manual");
            if (shouldRememberSync(this.cdi.getSyncCoordinator().getStatus().state)) {
                // The run failed — typically offline. Remember it so coming back
                // online completes the sync the user asked for.
                await this.cdi.getPendingSync().remember();
            }
        } catch (error) {
            // The manual path only rejects with NotAuthenticatedError; a
            // logged-in run captures its own failures into the sync status
            // (surfaced by syncLabel() as "Fehler"). Pressing Sync while logged
            // out expresses the intent to sync, so remember it and start the
            // login flow — the sync itself runs post-login (see main.ts).
            if (syncFailureAction(error).kind === "login") {
                await this.cdi.getPendingSync().remember();
                await this.handleLoginClick();
            } else {
                console.warn("handleSyncClick: sync failed", error);
            }
        }
    }


    static get styles() {
        return [
            ...super.styles,
            css`
                header {
                    display: contents;
                }

                h1 {
                    position: fixed;
                    top: 10px;
                    left: 12px;
                    right: 12px;
                    height: 64px;
                    background-color: var(--km-bg);
                    backdrop-filter: blur(5px);
                    -webkit-backdrop-filter: blur(20px);
                    border-radius: 20px;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    color: var(--app-color-primary, #3A6B28);
                    font-family: var(--app-font-family-display);
                    font-style: italic;
                    font-size: 30px;
                    font-weight: 500;
                    z-index: 1000;
                }

                /* Spinner */
                .spinner {
                    width: 28px;
                    height: 28px;
                    border: 3px solid var(--km-border, #E4DFD7);
                    border-top-color: var(--app-color-primary, #3A6B28);
                    border-radius: 50%;
                    animation: spin 0.7s linear infinite;
                }

                @keyframes spin {
                    to { transform: rotate(360deg); }
                }

                /* Cellar grid layout (logged in) */
                .cellar-grid {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 20px;
                    padding: 24px 20px;
                }

                /* Login CTA section */
                .login-cta {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    padding: 32px 20px 20px;
                    gap: 8px;
                }

                .login-cta-label {
                    font-size: 13px;
                    font-weight: 500;
                    letter-spacing: 0.06em;
                    text-transform: uppercase;
                    color: var(--km-text-muted, #8A8278);
                }

                /* Intro section */
                .intro {
                    padding: 8px 20px 24px;
                    max-width: 600px;
                    margin: 0 auto;
                }

                .intro p {
                    font-size: 15px;
                    line-height: 1.75;
                    color: var(--app-primary-on-white-background, #8A8278);
                    margin-bottom: 20px;
                }

                .intro em {
                    font-style: italic;
                    color: var(--app-color-primary, #3A6B28);
                }

                .intro a {
                    color: var(--app-color-primary, #3A6B28);
                    font-weight: bold;
                    text-decoration: none;
                    border-bottom: 1px solid var(--km-border, #E4DFD7);
                }

                details {
                    border-top: 1px solid var(--km-border, #E4DFD7);
                    padding: 0;
                }

                details:last-of-type {
                    border-bottom: 1px solid var(--km-border, #E4DFD7);
                    margin-bottom: 20px;
                }

                summary {
                    font-size: 14px;
                    font-weight: 500;
                    color: var(--app-primary-on-white-background, #1A1917);
                    padding: 14px 4px;
                    cursor: pointer;
                    list-style: none;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    letter-spacing: 0.01em;
                }

                summary::after {
                    content: '+';
                    font-size: 18px;
                    font-weight: 300;
                    color: var(--km-text-muted, #8A8278);
                    transition: transform 0.2s ease;
                }

                details[open] summary::after {
                    transform: rotate(45deg);
                }

                details p {
                    padding: 0 4px 16px;
                    font-size: 14px;
                    line-height: 1.75;
                    color: var(--km-text-muted, #8A8278);
                }

                /* Dialog */
                .dialog-overlay {
                    position: fixed;
                    inset: 0;
                    background: rgba(26, 25, 23, 0.5);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 2000;
                    backdrop-filter: blur(4px);
                }

                .dialog {
                    background: var(--km-surface, #fff);
                    border-radius: 16px;
                    border: 1px solid var(--km-border, #E4DFD7);
                    box-shadow: 0 20px 60px rgba(26, 25, 23, 0.15);
                    padding: 32px 28px 24px;
                    width: min(440px, 92vw);
                    color: var(--km-text, #1A1917);
                    display: flex;
                    flex-direction: column;
                    gap: 14px;
                }

                .dialog h2 {
                    font-family: var(--app-font-family-display, Georgia, serif);
                    font-size: 22px;
                    font-weight: 500;
                    font-style: italic;
                    color: var(--app-color-primary, #3A6B28);
                    margin: 0;
                    letter-spacing: 0.01em;
                }

                .dialog p {
                    margin: 0;
                    font-size: 14px;
                    color: var(--km-text-muted, #8A8278);
                    line-height: 1.6;
                }

                .dialog-select,
                .dialog-input {
                    width: 100%;
                    box-sizing: border-box;
                    padding: 11px 14px;
                    border-radius: 8px;
                    border: 1.5px solid var(--km-border, #E4DFD7);
                    background: var(--km-bg, #F7F5F1);
                    color: var(--km-text, #1A1917);
                    font-family: var(--app-font-family, 'DM Sans', sans-serif);
                    font-size: 14px;
                    outline: none;
                    transition: border-color 0.2s ease;
                }

                .dialog-select:focus,
                .dialog-input:focus {
                    border-color: var(--app-color-primary, #3A6B28);
                }

                .dialog-select:disabled,
                .dialog-input:disabled {
                    opacity: 0.5;
                }

                .dialog-error {
                    margin: 0;
                    font-size: 13px;
                    color: #b91c1c;
                }

                .dialog-actions {
                    display: flex;
                    justify-content: flex-end;
                    gap: 10px;
                    margin-top: 4px;
                }

                .dialog-btn {
                    padding: 10px 22px;
                    border-radius: 8px;
                    border: none;
                    font-family: var(--app-font-family, 'DM Sans', sans-serif);
                    font-size: 14px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: opacity 0.2s ease, transform 0.1s ease;
                    letter-spacing: 0.02em;
                }

                .dialog-btn:active {
                    transform: scale(0.97);
                }

                .dialog-btn:disabled {
                    opacity: 0.45;
                    cursor: not-allowed;
                }

                .dialog-btn-cancel {
                    background: var(--km-bg, #F7F5F1);
                    color: var(--km-text-muted, #8A8278);
                    border: 1px solid var(--km-border, #E4DFD7);
                }

                .dialog-btn-ok {
                    background: var(--app-color-primary, #3A6B28);
                    color: #fff;
                }

                .dialog-btn-ok:hover:not(:disabled) {
                    opacity: 0.85;
                }

                /* Version info */
                .version-info {
                    display: flex;
                    flex-direction: row;
                    align-items: center;
                    justify-content: center;
                    gap: 6px;
                    padding: 20px;
                    color: var(--km-text-muted, #8A8278);
                }

                .version-label {
                    font-size: 11px;
                    font-weight: 500;
                    text-transform: uppercase;
                    letter-spacing: 0.08em;
                }

                .version-number {
                    font-family: var(--app-font-family-monospace);
                    font-size: 11px;
                    opacity: 0.7;
                }

                /* Process image thumbnail */
                .process-img {
                    display: block;
                    max-width: 100%;
                    width: 100%;
                    border-radius: 8px;
                    margin-top: 10px;
                    cursor: zoom-in;
                    transition: opacity 0.15s ease;
                }

                .process-img:hover {
                    opacity: 0.85;
                }

                /* Lightbox overlay */
                .lightbox-overlay {
                    position: fixed;
                    inset: 0;
                    background: rgba(26, 25, 23, 0.88);
                    z-index: 3000;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: zoom-out;
                    backdrop-filter: blur(6px);
                    -webkit-backdrop-filter: blur(6px);
                }

                .lightbox-img {
                    max-width: 95vw;
                    max-height: 95vh;
                    object-fit: contain;
                    border-radius: 8px;
                    box-shadow: 0 24px 80px rgba(0, 0, 0, 0.5);
                }

                .gif-responsive {
                    width: 100%;
                    max-width: 430px;
                    height: auto;
                }
            `
        ];
    }

}

declare global {
    interface HTMLElementTagNameMap {
        'landing-page': LandingPage;
    }
}