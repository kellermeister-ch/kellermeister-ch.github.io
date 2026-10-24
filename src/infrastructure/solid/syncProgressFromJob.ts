import type {ContainerProgress, SyncCollection, SyncProgress} from "../../application/ports/SyncService.ts";

/** The shape of soukai-bis's `JobStatus` tree node (see `Job.serialize()`). */
interface JobStatusNode {
    completed?: boolean;
    children?: JobStatusNode[];
}

/**
 * Translate soukai-bis's `Sync` job status tree into the app's progress model.
 *
 * The tree is `{root, children: [pull, push]}`; `pull.children[i]` is the i-th
 * container registered in the type index (so `collections` must be in the same
 * order as the type index registrations), and gets one child per document once
 * its listing has been read. A document is marked completed whether it was
 * pulled, skipped as unchanged, or failed.
 *
 * The tree is not a documented soukai-bis API: on any unexpected shape this
 * reports only the overall share (from the documented `onUpdated` event), with
 * no container rows. `overall` never decreases below `previousOverall`.
 */
export function toSyncProgress(
    status: unknown,
    overall: number,
    collections: readonly SyncCollection[],
    previousOverall: number = 0,
): SyncProgress {
    const share = Math.max(previousOverall, overall);
    const pull = (status as JobStatusNode | undefined)?.children?.[0];
    // Before the pull has registered its containers there is no list yet:
    // report every container as not listed.
    const containerNodes = pull && pull.children === undefined && !pull.completed
        ? collections.map((): JobStatusNode => ({completed: false}))
        : pull?.children;
    if (!pull || !Array.isArray(containerNodes) || containerNodes.length !== collections.length) {
        return {step: "pull", overall: share, containers: []};
    }
    const containers: ContainerProgress[] = collections.map((collection, index) => {
        const node = containerNodes[index] ?? {};
        const documents = Array.isArray(node.children) ? node.children : [];
        if (documents.length === 0) {
            // Not listed yet — or listed and empty, which the job marks completed.
            return node.completed ? {collection, done: 0, total: 0} : {collection, done: 0, total: null};
        }
        return {collection, done: documents.filter((document) => document.completed).length, total: documents.length};
    });
    return {step: pull.completed ? "push" : "pull", overall: share, containers};
}
