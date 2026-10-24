import {css, html, LitElement} from "lit";
import {customElement, state} from "lit/decorators.js";
import {CDI} from "../../cdi/CDI.ts";
import type {ContainerProgress, SyncCollection, SyncStep} from "../../../application/ports/SyncService.ts";
import {SyncDialogState, type SyncDialogView} from "./sync-progress-dialog-state.ts";

const STEP_LABEL: Record<SyncStep, string> = {
    profile: "Profil laden",
    prepare: "Lokale Daten vorbereiten",
    pull: "Abgleich mit dem Pod",
    push: "Änderungen hochladen",
    finish: "Abschluss",
};

const COLLECTION_LABEL: Record<SyncCollection, string> = {
    cellars: "Keller",
    products: "Weine",
    bottles: "Flaschen",
    orders: "Bestellungen",
};

/**
 * App-wide dialog showing a running Pod sync: the current step, an overall bar,
 * and one row per container with its processed/total document count. When it
 * opens and closes is decided by {@link SyncDialogState}; this only renders it.
 */
@customElement("sync-progress-dialog")
class SyncProgressDialog extends LitElement {

    private readonly cdi = CDI.getInstance();
    private unsubscribe: (() => void) | null = null;
    private readonly dialogState = new SyncDialogState((view) => this.view = view);

    @state()
    private view: SyncDialogView = this.dialogState.getView();

    static styles = css`
        .overlay {
            position: fixed;
            inset: 0;
            background: rgba(26, 25, 23, 0.4);
            z-index: 2000;
            display: flex;
            align-items: center;
            justify-content: center;
            backdrop-filter: blur(4px);
        }
        .container {
            width: calc(100% - 64px);
            max-width: 360px;
            background: var(--km-surface, white);
            border-radius: 12px;
            border: 1px solid var(--km-border, #E4DFD7);
            padding: 20px;
            box-shadow: 0 16px 48px rgba(26, 25, 23, 0.15);
            font-family: var(--app-font-family, 'DM Sans', sans-serif);
            color: var(--km-text, #1A1917);
        }
        .title {
            font-size: 18px;
            font-weight: 600;
            text-align: center;
            margin-bottom: 16px;
        }
        .step {
            display: flex;
            justify-content: space-between;
            font-size: 14px;
            color: var(--km-text-muted, #8A8278);
            margin-bottom: 6px;
        }
        .bar {
            height: 8px;
            border-radius: 4px;
            background: var(--km-bg, #F7F5F1);
            border: 1px solid var(--km-border, #E4DFD7);
            overflow: hidden;
        }
        .bar > div {
            height: 100%;
            background: var(--app-color-primary, #3A6B28);
            transition: width 0.3s ease;
        }
        .rows {
            display: grid;
            grid-template-columns: auto 1fr auto;
            align-items: center;
            gap: 8px 12px;
            margin-top: 20px;
            font-size: 14px;
        }
        .count {
            text-align: right;
            font-variant-numeric: tabular-nums;
            color: var(--km-text-muted, #8A8278);
        }
        .error {
            margin-top: 16px;
            font-size: 14px;
            color: #C0392B;
        }
        .action {
            display: block;
            width: 100%;
            margin-top: 20px;
            padding: 10px 16px;
            border-radius: 8px;
            font-family: inherit;
            font-size: 15px;
            font-weight: 500;
            cursor: pointer;
            background: var(--km-bg, #F7F5F1);
            color: var(--km-text-muted, #8A8278);
            border: 1.5px solid var(--km-border, #E4DFD7);
        }
    `;

    connectedCallback(): void {
        super.connectedCallback();
        this.unsubscribe = this.cdi.getSyncCoordinator().onStatusChange((status) => this.dialogState.update(status));
    }

    disconnectedCallback(): void {
        super.disconnectedCallback();
        this.unsubscribe?.();
        this.unsubscribe = null;
        this.dialogState.dispose();
    }

    render() {
        const {mode, progress, error} = this.view;
        if (mode === "hidden") {
            return html``;
        }
        const overall = Math.round((progress?.overall ?? 0) * 100);
        const stepLabel = mode === "done" ? "Abgeschlossen" : mode === "failed" ? "Fehlgeschlagen" : STEP_LABEL[progress?.step ?? "profile"];
        return html`
            <div class="overlay">
                <div class="container" role="dialog" aria-label="Synchronisieren">
                    <div class="title">Synchronisieren</div>
                    <div class="step"><span>${stepLabel}</span><span class="percent">${overall} %</span></div>
                    ${bar(overall)}
                    ${progress && progress.containers.length > 0 ? html`
                        <div class="rows">
                            ${progress.containers.map((container) => row(container))}
                        </div>
                    ` : ""}
                    ${mode === "failed" ? html`
                        <div class="error">${error}</div>
                        <button class="action" @click="${() => this.dialogState.close()}">Schliessen</button>
                    ` : html`
                        <button class="action" @click="${() => this.dialogState.dismiss()}">Im Hintergrund</button>
                    `}
                </div>
            </div>
        `;
    }
}

function bar(percent: number) {
    return html`<div class="bar"><div style="width: ${percent}%"></div></div>`;
}

function row(container: ContainerProgress) {
    const {collection, done, total} = container;
    const percent = total ? Math.round(done / total * 100) : total === 0 ? 100 : 0;
    return html`
        <span class="label">${COLLECTION_LABEL[collection]}</span>
        ${bar(percent)}
        <span class="count">${total === null ? "…" : `${done}/${total}`}</span>
    `;
}

export {SyncProgressDialog};
