import {css, html} from 'lit';
import {customElement, property, state} from 'lit/decorators.js';
import {unsafeHTML} from 'lit/directives/unsafe-html.js';
import {Task} from '@lit/task';
import {BasePage} from "../common/base-page.ts";
import {Router, type RouterLocation} from "@vaadin/router";
import {ProductFilter} from "../../../domain/Product/ProductFilter.ts";
import {CDI} from "../../cdi/CDI.ts";
import '../components/kellermeister-button.ts';
import '../components/kellermeister-header.ts';
import '../components/kellermeister-footer.ts';
import '../components/kellermeister-wine-filter.ts';
import '../components/bottle-component.ts';
import '../components/swipe-row.ts';
import {router} from "../router.ts";
import {getDefaultSession} from "@inrupt/solid-client-authn-browser";
import type {Bottle} from "../../../domain/Bottle/Bottle.ts";
import type {Cellar} from "../../../domain/Cellar/Cellar.ts";
import {CELLAR_UPDATED_EVENT} from "../events.ts";
import plusIcon from "../images/icons/plus.svg?raw";
import {formatBottleCount} from "../components/bottle-count-format.ts";

@customElement('cellar-page')
class CellarPage extends BasePage {

    @property()
    cellarId?: string;

    @state()
    cellar?: Cellar = undefined;

    @state()
    filter: ProductFilter;

    @state()
    private showSearchInput: boolean = false;

    @state()
    private searchText: string = '';

    @state()
    private ratingBottle?: Bottle = undefined;

    @state()
    private selectedRating?: number = undefined;

    // Number of bottles in the row whose count was clicked (the dialog's current count).
    private ratingCount: number = 0;

    // Bottle-count dialog ("+" in the rating dialog): the row's bottle and the entered value.
    @state()
    private countBottle?: Bottle = undefined;

    @state()
    private countValue: string = '';

    private cdi: CDI = CDI.getInstance();

    // Altglass swipe-to-delete: the row currently swiped open (at most one).
    private openSwipeRow: HTMLElementTagNameMap['swipe-row'] | null = null;

    // While a row is open, a tap anywhere outside it closes it.
    private closeOpenSwipeRowOnOutsideTap = (e: PointerEvent) => {
        if (this.openSwipeRow && !e.composedPath().includes(this.openSwipeRow)) {
            this.closeOpenSwipeRow();
        }
    };

    private _bottlesTask = new Task(this, async () => {
        if (this.cellar) {
            return await this.cdi.getKellermeisterService().bottlesFromCellarGroupedByProduct(this.cellar, this.filter);
        }
        return new Map<string, Bottle[]>();
    });

    // The cellar's total (the header's denominator), so this deliberately ignores this.filter.
    private _bottleCountTask = new Task(this, async () => {
        return await this.cdi.getKellermeisterService().bottleCountInCellar(this.cellar);
    });

    constructor() {
        super();
        this.filter = new ProductFilter();
    }

    updated(changedProperties: Map<string, unknown>) {
        if (changedProperties.has('showSearchInput') && this.showSearchInput) {
            this.shadowRoot?.querySelector<HTMLInputElement>('.search-input')?.focus();
        }
    }

    connectedCallback() {
        super.connectedCallback();
        // The footer can ingest into this cellar (e.g. a photo add into cellarwork)
        // while this page is already mounted; navigating to the route it is already
        // on is a router no-op, so reload the bottles when told the cellar changed.
        window.addEventListener(CELLAR_UPDATED_EVENT, this.handleCellarUpdated);
    }

    disconnectedCallback() {
        window.removeEventListener(CELLAR_UPDATED_EVENT, this.handleCellarUpdated);
        this.closeOpenSwipeRow();
        super.disconnectedCallback();
    }

    private handleCellarUpdated = () => {
        this.loadBottles();
    };

    async onBeforeEnter(location: RouterLocation) {
        const { cellarId } = location.params;
        this.filter = ProductFilter.fromSearchParams(new URLSearchParams(location.search));
        if (this.filter.textFilter) {
            this.searchText = this.filter.textFilter;
        }
        await this.loadCellar(cellarId as string);
        await this.ingestInboxIfCellarwork();
        this.loadBottles();
    }

    /**
     * The cellarwork cellar behaves like any cellar (opens to its bottle list),
     * but must still turn Pod-inbox orders into bottles on open — so when this
     * page is showing the cellarwork cellar, run the (single-flight, idempotent)
     * inbox ingestion before listing. Best-effort: a failure still shows the
     * existing bottles.
     */
    private async ingestInboxIfCellarwork(): Promise<void> {
        const isCellarwork = this.cellar?.getId() === this.cdi.getKellermeisterService().getCellarWorkId();
        if (isCellarwork && getDefaultSession().info.isLoggedIn) {
            try {
                await this.cdi.getKellermeisterService().ingestOrdersFromInbox();
            } catch (error) {
                console.error("cellar-page: inbox ingestion failed", error);
            }
        }
    }

    render() {
        return html`
          <kellermeister-header>Keller ${this.cellar?.getName()}
              ${this._bottleCountTask.render({
                  complete: (count) => html`<span slot="subtitle">${formatBottleCount(count, this.matchingBottleCount())}</span>`,
              })}
              <kellermeister-button slot="actions" text="Search" @click="${this.handleTextFilterClick}" .ghost=${this.filter.isText} icon="search" size="small"></kellermeister-button>
              <kellermeister-button slot="actions" text="Kellerarbeit" @click="${this.handleCellarworkClick}" icon="work" size="small"></kellermeister-button>
          </kellermeister-header>
          <div class="filter">
              <kellermeister-button text="Sprudel" @click="${this.handleSprudelFilterClick}" .ghost=${this.filter.isSprudel} icon="wine-bubble" size="small"></kellermeister-button>
              <kellermeister-button text="Rot" @click="${this.handleRedFilterClick}" .ghost=${this.filter.isRed} icon="wine-red" size="small"></kellermeister-button>
              <kellermeister-button text="Weiss" @click="${this.handleWhiteFilterClick}" .ghost=${this.filter.isWhite} icon="wine-white" size="small"></kellermeister-button>
              <kellermeister-button text="Rosé" @click="${this.handleRoseFilterClick}" .ghost=${this.filter.isRose} icon="wine-rose" size="small"></kellermeister-button>
              </div>
          ${this.showSearchInput ? html`
              <div class="search-overlay" @click="${this.handleSearchClose}">
                  <div class="search-container" @click="${(e: Event) => e.stopPropagation()}">
                      <input
                          class="search-input"
                          type="search"
                          .value="${this.searchText}"
                          @input="${this.handleSearchInput}"
                          @keydown="${(e: KeyboardEvent) => e.key === 'Escape' && this.handleSearchClose()}"
                          @search="${this.handleSearchClear}"
                          placeholder="Suchen..."
                      />
                  </div>
              </div>
          ` : ''}
          ${this.ratingBottle ? html`
              <div class="rating-overlay">
                  <div class="rating-container">
                      <button class="rating-add" aria-label="Flaschen hinzufügen" title="Flaschen hinzufügen" @click="${this.handleCountOpen}">${unsafeHTML(plusIcon)}</button>
                      <div class="rating-product">${this.ratingBottle.getProduct()?.getName()}</div>
                      <div class="rating-title">Bewertung</div>
                      <div class="rating-buttons">
                          ${[0, 1, 2, 3].map(value => html`
                              <button
                                  class="rating-button ${this.selectedRating === value ? 'selected' : ''}"
                                  @click="${() => this.handleRatingSelect(value)}"
                              >${value}</button>
                          `)}
                      </div>
                      <div class="rating-actions">
                          <button class="rating-action cancel" @click="${this.handleRatingCancel}">Abbrechen</button>
                          <button class="rating-action confirm" @click="${this.handleRatingConfirm}">Altglass</button>
                      </div>
                  </div>
              </div>
          ` : ''}
          ${this.countBottle ? html`
              <div class="rating-overlay">
                  <div class="rating-container count-container">
                      <div class="rating-product">${this.countBottle.getProduct()?.getName()}</div>
                      <label class="count-row">
                          <span class="count-label">Anzahl Flaschen</span>
                          <input
                              class="count-input"
                              type="number"
                              inputmode="numeric"
                              min="${this.ratingCount}"
                              step="1"
                              .value="${this.countValue}"
                              @input="${(e: Event) => this.countValue = (e.target as HTMLInputElement).value}"
                          />
                      </label>
                      <div class="rating-actions">
                          <button class="rating-action cancel" @click="${this.handleCountCancel}">Abbrechen</button>
                          <button class="rating-action confirm" ?disabled="${!this.isCountIncrease()}" @click="${this.handleCountConfirm}">Aktualisieren</button>
                      </div>
                  </div>
              </div>
          ` : ''}
          <main>
                    ${this._bottlesTask.render({
                        pending: () => html`<div class="spinner"></div>`,
                        complete: (bottles) => bottles.size > 0
                            ? html`<div class="bottles">
                              ${[...bottles.values()].map(bottleGroup => {
                                    const row = html`
                                        <bottle-component .bottle="${bottleGroup[0]}">
                                            <button @click="${() => this.handleBottleClick(bottleGroup[0], bottleGroup.length)}" class="bottle-button" slot="count">${bottleGroup.length}</button>
                                        </bottle-component>`;
                                    // Swipe-to-delete exists only in the Altglass cellar.
                                    return html`
                                        <li>
                                            ${this.isAltglass() ? html`
                                                <swipe-row
                                                    @swipe-open="${this.handleSwipeOpen}"
                                                    @swipe-delete="${() => this.handleSwipeDelete(bottleGroup)}"
                                                >${row}</swipe-row>
                                            ` : row}
                                        </li>
                                    `;
                              })}
                            </div>`
                            : html`
                              <p class="no-bottles">Keine Flaschen in diesem Keller gefunden.</p>
                            `,
                    })}
          </main>
          <footer>
              <kellermeister-footer></kellermeister-footer>
          </footer>
    `;
    }

    /**
     * While a filter is active, the number of bottles in the listed rows
     * (summed from the filtered groups, so it always matches the row badges);
     * undefined without a filter, so the header shows only the total.
     */
    private matchingBottleCount(): number | undefined {
        const bottles = this._bottlesTask.value;
        if (!this.filter.hasRestrictions() || !bottles) {
            return undefined;
        }
        return [...bottles.values()].reduce((n, bottleGroup) => n + bottleGroup.length, 0);
    }

    private loadBottles() {
        if (this.cellar) {
            this._bottlesTask.run();
            this._bottleCountTask.run();
        } else {
            console.log("loadBottle: failed, because cellar is undefined!");
        }
    }

    private async loadCellar(cellarId: string) {
        if (cellarId) {
            const cellar: Cellar | null = await this.cdi.getKellermeisterService().getCellarById(cellarId);
            if (cellar) {
                this.cellar = cellar;
            }
        } else {
            console.log("loadCellar: failed, because cellarId is undefined!");
        }
    }

    private updateUrl(): void {
        const params = this.filter.toSearchParams();
        const search = params.toString() ? '?' + params.toString() : '';
        history.replaceState(null, '', window.location.pathname + search);
    }

    private handleCellarworkClick() {
        if (this.cellar) {
            const params = this.filter.toSearchParams();
            const search = params.toString() ? '?' + params.toString() : '';
            Router.go(router.urlForName('cellarwork-page', {cellarId: `${this.cellar.getId()}`}) + search);
        }
    }

    private handleSprudelFilterClick(): void {
        this.filter.toggleSprudelFilter();
        this.updateUrl();
        this.loadBottles();
    }

    private handleRedFilterClick(): void {
        this.filter.toggleRedFilter();
        this.updateUrl();
        this.loadBottles();
    }

    private handleWhiteFilterClick(): void {
        this.filter.toggleWhiteFilter();
        this.updateUrl();
        this.loadBottles();
    }

    private handleRoseFilterClick(): void {
        this.filter.toggleRoseFilter();
        this.updateUrl();
        this.loadBottles();
    }

    private handleTextFilterClick(): void {
        if (this.showSearchInput) {
            this.showSearchInput = false;
        } else {
            this.searchText = this.filter.textFilter?.toString() ?? '';
            this.showSearchInput = true;
        }
    }

    private handleSearchInput(e: InputEvent): void {
        this.searchText = (e.target as HTMLInputElement).value;
        this.filter.textFilter = this.searchText || null;
        this.filter.isText = !!this.searchText;
        this.updateUrl();
        this.loadBottles();
    }

    private handleSearchClose(): void {
        this.showSearchInput = false;
    }

    private handleSearchClear(): void {
        this.showSearchInput = false;
        this.filter.textFilter = null;
        this.filter.isText = false;
        this.searchText = '';
        this.updateUrl();
        this.loadBottles();
    }

    private isAltglass(): boolean {
        return this.cellar?.getId() === this.cdi.getKellermeisterService().getAltglassId();
    }

    private handleSwipeOpen(e: Event): void {
        const row = e.currentTarget as HTMLElementTagNameMap['swipe-row'];
        if (this.openSwipeRow && this.openSwipeRow !== row) {
            this.openSwipeRow.close();
        }
        this.openSwipeRow = row;
        document.addEventListener('pointerdown', this.closeOpenSwipeRowOnOutsideTap, true);
    }

    private closeOpenSwipeRow(): void {
        this.openSwipeRow?.close();
        this.openSwipeRow = null;
        document.removeEventListener('pointerdown', this.closeOpenSwipeRowOnOutsideTap, true);
    }

    private async handleSwipeDelete(bottles: Bottle[]): Promise<void> {
        this.closeOpenSwipeRow();
        await this.cdi.getKellermeisterService().deleteBottlesFromAltglass(bottles);
        this.loadBottles();
    }

    private handleBottleClick(bottle: Bottle, count: number): void {
        this.ratingBottle = bottle;
        this.ratingCount = count;
        this.selectedRating = undefined;
    }

    private handleRatingSelect(rating: number): void {
        this.selectedRating = rating;
    }

    private handleRatingCancel(): void {
        this.ratingBottle = undefined;
        this.selectedRating = undefined;
    }

    private handleCountOpen(): void {
        this.countBottle = this.ratingBottle;
        this.countValue = String(this.ratingCount);
        this.ratingBottle = undefined;
        this.selectedRating = undefined;
    }

    private handleCountCancel(): void {
        this.countBottle = undefined;
    }

    /** Only whole numbers above the current count are accepted — the dialog never removes bottles. */
    private isCountIncrease(): boolean {
        const value = Number(this.countValue);
        return this.countValue.trim() !== '' && Number.isInteger(value) && value > this.ratingCount;
    }

    private async handleCountConfirm(): Promise<void> {
        if (this.countBottle && this.cellar && this.isCountIncrease()) {
            await this.cdi.getKellermeisterService().addBottlesOfProduct(
                this.countBottle.getProduct(), this.cellar.getId(), Number(this.countValue) - this.ratingCount);
            this.loadBottles();
        }
        this.countBottle = undefined;
    }

    private async handleRatingConfirm(): Promise<void> {
        if (this.ratingBottle) {
            await this.cdi.getKellermeisterService().disposeBottleToAltglass(this.ratingBottle, this.selectedRating);
            this.loadBottles();
        }
        this.ratingBottle = undefined;
        this.selectedRating = undefined;
    }

    static get styles() {
        return [
            ...super.styles,
            css`
                :host {
                    display: block;
                    background: var(--km-bg, #F7F5F1);
                }

                main {
                    padding: 0 16px 16px 16px;
                }

                .filter {
                    display: flex;
                    justify-content: space-evenly;
                    align-items: center;
                    padding: 12px 8px;
                }

                .bottles {
                    padding: 0;
                    background: var(--km-surface, white);
                    border-radius: 12px;
                    overflow: hidden;
                    border: 1px solid var(--km-border, #E4DFD7);
                }

                li {
                    list-style: none;
                    display: block;
                    background: var(--km-surface, white);
                }

                li:not(:last-child) {
                    border-bottom: 1px solid var(--km-border, #E4DFD7);
                }

                .bottle-button {
                    background: var(--km-bg, #F7F5F1);
                    color: var(--km-text-muted, #8A8278);
                    border: 1px solid var(--km-border, #E4DFD7);
                    border-radius: 20px;
                    padding: 3px 10px;
                    font-family: var(--app-font-family, 'DM Sans', sans-serif);
                    font-size: 12px;
                    font-weight: 500;
                    min-width: 28px;
                    cursor: default;
                    letter-spacing: 0.02em;
                }

                .search-overlay {
                    position: fixed;
                    inset: 0;
                    background: rgba(26, 25, 23, 0.4);
                    z-index: 2000;
                    display: flex;
                    align-items: flex-start;
                    padding-top: 90px;
                    backdrop-filter: blur(4px);
                }

                .search-container {
                    width: calc(100% - 32px);
                    margin: 0 16px;
                    background: var(--km-surface, white);
                    border-radius: 12px;
                    border: 1px solid var(--km-border, #E4DFD7);
                    padding: 12px;
                    box-shadow: 0 16px 48px rgba(26, 25, 23, 0.15);
                }

                .search-input {
                    width: 100%;
                    box-sizing: border-box;
                    padding: 10px 14px;
                    border-radius: 8px;
                    border: 1.5px solid var(--km-border, #E4DFD7);
                    background: var(--km-bg, #F7F5F1);
                    font-family: var(--app-font-family, 'DM Sans', sans-serif);
                    font-size: 15px;
                    color: var(--km-text, #1A1917);
                    outline: none;
                    transition: border-color 0.2s ease;
                }

                .search-input:focus {
                    border-color: var(--app-color-primary, #3A6B28);
                }
                
                /* Spinner */
                .spinner {
                    width: 28px;
                    height: 28px;
                    border: 3px solid var(--km-border, #E4DFD7);
                    border-top-color: var(--app-color-primary, #3A6B28);
                    border-radius: 50%;
                    animation: spin 0.7s linear infinite;
                    margin: 16px auto;
                }

                @keyframes spin {
                    to { transform: rotate(360deg); }
                }

                .no-bottles {
                    text-align: center;
                }

                .rating-overlay {
                    position: fixed;
                    inset: 0;
                    background: rgba(26, 25, 23, 0.4);
                    z-index: 2000;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    backdrop-filter: blur(4px);
                }

                .rating-container {
                    position: relative;
                    width: calc(100% - 64px);
                    max-width: 360px;
                    background: var(--km-surface, white);
                    border-radius: 12px;
                    border: 1px solid var(--km-border, #E4DFD7);
                    padding: 20px;
                    box-shadow: 0 16px 48px rgba(26, 25, 23, 0.15);
                }

                /* Product name is the title, "Bewertung" the subtitle below it. */
                .rating-product {
                    font-family: var(--app-font-family, 'DM Sans', sans-serif);
                    font-size: 18px;
                    font-weight: 600;
                    color: var(--km-text, #1A1917);
                    text-align: center;
                    margin: 0 32px 4px;
                }

                .rating-title {
                    font-family: var(--app-font-family, 'DM Sans', sans-serif);
                    font-size: 14px;
                    color: var(--km-text-muted, #8A8278);
                    text-align: center;
                    margin-bottom: 20px;
                }

                .rating-add {
                    position: absolute;
                    top: 12px;
                    right: 12px;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    width: 32px;
                    height: 32px;
                    padding: 0;
                    border: none;
                    background: transparent;
                    color: var(--km-text, #1A1917);
                    cursor: pointer;
                    border-radius: 8px;
                }

                .rating-add svg {
                    width: 18px;
                    height: 18px;
                }

                .rating-add svg path {
                    stroke: currentColor;
                    stroke-width: 2.5;
                }

                .rating-add:active {
                    opacity: 0.6;
                }

                .count-container .rating-product {
                    margin-bottom: 20px;
                }

                .count-row {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 12px;
                }

                .count-label {
                    font-family: var(--app-font-family, 'DM Sans', sans-serif);
                    font-size: 15px;
                    color: var(--km-text, #1A1917);
                }

                .count-input {
                    width: 5em;
                    box-sizing: border-box;
                    padding: 8px 12px;
                    border-radius: 8px;
                    border: 1.5px solid var(--km-border, #E4DFD7);
                    background: var(--km-bg, #F7F5F1);
                    font-family: var(--app-font-family, 'DM Sans', sans-serif);
                    font-size: 16px;
                    color: var(--km-text, #1A1917);
                    text-align: right;
                    outline: none;
                }

                .count-input:focus {
                    border-color: var(--app-color-primary, #3A6B28);
                }

                .rating-buttons {
                    display: flex;
                    justify-content: space-between;
                    gap: 12px;
                }

                .rating-button {
                    flex: 1;
                    aspect-ratio: 1;
                    border-radius: 50%;
                    border: 1.5px solid var(--km-border, #E4DFD7);
                    background: var(--km-bg, #F7F5F1);
                    color: var(--km-text, #1A1917);
                    font-family: var(--app-font-family, 'DM Sans', sans-serif);
                    font-size: 20px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: transform 0.15s ease, border-color 0.2s ease, background 0.2s ease;
                }

                .rating-button:hover {
                    border-color: var(--app-color-primary, #3A6B28);
                }

                .rating-button:active {
                    transform: scale(0.94);
                }

                .rating-button.selected {
                    background: var(--app-color-primary, #3A6B28);
                    color: white;
                    border-color: var(--app-color-primary, #3A6B28);
                }

                .rating-actions {
                    display: flex;
                    justify-content: space-between;
                    gap: 12px;
                    margin-top: 20px;
                }

                .rating-action {
                    flex: 1;
                    padding: 10px 16px;
                    border-radius: 8px;
                    font-family: var(--app-font-family, 'DM Sans', sans-serif);
                    font-size: 15px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: transform 0.15s ease, opacity 0.15s ease;
                }

                .rating-action:active {
                    transform: scale(0.97);
                    opacity: 0.85;
                }

                .rating-action.cancel {
                    background: var(--km-bg, #F7F5F1);
                    color: var(--km-text-muted, #8A8278);
                    border: 1.5px solid var(--km-border, #E4DFD7);
                }

                .rating-action.confirm {
                    background: var(--app-color-primary, #3A6B28);
                    color: white;
                    border: 1.5px solid var(--app-color-primary, #3A6B28);
                }

                .rating-action:disabled {
                    opacity: 0.4;
                    cursor: default;
                    transform: none;
                }
            `
        ];
    }
}

declare global {
    interface HTMLElementTagNameMap {
        'cellar-page': CellarPage;
    }
}