import {css, html, LitElement} from "lit";
import {customElement, state} from "lit/decorators.js";

/**
 * App-wide banner offering a new app version. It stays hidden until {@link show}
 * is called; "Neu laden" runs the given reload, "Später" hides it until the next
 * new version (or the next app start, which loads the waiting version anyway).
 */
@customElement("update-banner")
class UpdateBanner extends LitElement {

    private reload: (() => void) | null = null;

    @state()
    private visible = false;

    static styles = css`
        .banner {
            position: fixed;
            top: 92px;
            left: 50%;
            transform: translateX(-50%);
            width: calc(100% - 32px);
            max-width: 420px;
            box-sizing: border-box;
            z-index: 1500;
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 10px 12px 10px 16px;
            background: var(--km-surface, white);
            border: 1px solid var(--km-border, #E4DFD7);
            border-radius: 12px;
            box-shadow: 0 8px 24px rgba(26, 25, 23, 0.15);
            font-family: var(--app-font-family, 'DM Sans', sans-serif);
            font-size: 14px;
            color: var(--km-text, #1A1917);
        }
        .message {
            flex: 1;
        }
        button {
            padding: 6px 12px;
            border-radius: 8px;
            font-family: inherit;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            white-space: nowrap;
        }
        .later {
            background: none;
            border: none;
            color: var(--km-text-muted, #8A8278);
        }
        .reload {
            background: var(--app-color-primary, #3A6B28);
            border: 1px solid var(--app-color-primary, #3A6B28);
            color: white;
        }
    `;

    show(reload: () => void): void {
        this.reload = reload;
        this.visible = true;
    }

    render() {
        if (!this.visible) {
            return html``;
        }
        return html`
            <div class="banner" role="status">
                <span class="message">Neue Version verfügbar</span>
                <button class="later" @click="${() => this.visible = false}">Später</button>
                <button class="reload" @click="${() => this.reload?.()}">Neu laden</button>
            </div>
        `;
    }
}

export {UpdateBanner};
