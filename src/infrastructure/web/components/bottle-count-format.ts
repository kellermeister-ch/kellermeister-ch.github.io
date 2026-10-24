/**
 * Format the cellar header's bottle count, e.g. `764 Flaschen` or `1 Flasche`.
 * With a `matching` count (a filter is active) it reads `14 von 764 Flaschen`;
 * the unit word always agrees with the total.
 */
export function formatBottleCount(total: number, matching?: number): string {
    const unit = total === 1 ? "Flasche" : "Flaschen";
    return matching === undefined ? `${total} ${unit}` : `${matching} von ${total} ${unit}`;
}
