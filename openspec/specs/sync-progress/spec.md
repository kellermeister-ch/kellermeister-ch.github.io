# sync-progress Specification

## Purpose
Lets the user follow a running Pod synchronization: which step it is in, how far it has come overall, and how many documents of each synced container are done, in a dialog that can be sent to the background and closes itself once the sync succeeds.

## Requirements

### Requirement: Sync progress is reported while a sync runs

While a synchronization runs, the system SHALL report progress made up of the current step, the overall share completed (0–100 %), and for each synced container (Keller, Weine, Flaschen, Bestellungen) the number of documents processed and, once known, the container's total. The overall share SHALL never decrease during a run.

#### Scenario: Steps are reported in order
- **WHEN** a synchronization runs to completion
- **THEN** the reported step goes through "Profil laden", "Lokale Daten vorbereiten", "Abgleich mit dem Pod", "Änderungen hochladen", and "Abschluss" in this order

#### Scenario: A container's total becomes known
- **WHEN** the listing of the bottles container has been read and holds 842 documents
- **THEN** the progress for Flaschen reports a total of 842 and the number of those documents processed so far

#### Scenario: A container not yet listed
- **WHEN** a container's listing has not been read yet
- **THEN** its progress reports no total and zero documents processed

#### Scenario: Unchanged documents count as processed
- **WHEN** a document is skipped because it is unchanged since the last sync
- **THEN** it still counts as processed for its container

#### Scenario: Progress ends at 100 %
- **WHEN** a synchronization finishes successfully
- **THEN** the overall share reported last is 100 % and every container reports all of its documents processed

### Requirement: A progress dialog shows a running sync

When a synchronization has been running for longer than a short delay (about half a second), the app SHALL show a progress dialog over the current page. It shows the current step, an overall progress bar with its percentage, and one row per container with a bar and a `processed/total` count, or `…` while the total is unknown. The dialog SHALL appear on every page, including for the remembered sync that runs after login.

#### Scenario: A long sync opens the dialog
- **WHEN** the user presses Sync and the synchronization takes several seconds
- **THEN** the progress dialog appears with the current step, the overall bar, and rows for Keller, Weine, Flaschen and Bestellungen

#### Scenario: A short sync does not flash the dialog
- **WHEN** a synchronization finishes within the delay
- **THEN** no progress dialog appears

#### Scenario: Sync after login
- **WHEN** the remembered sync starts after the user has logged in
- **THEN** the progress dialog appears for it like for a sync started with the Sync button

#### Scenario: Counts update while the sync runs
- **WHEN** documents of a container are processed
- **THEN** that container's count and bar and the overall bar advance without the user doing anything

### Requirement: The dialog can be sent to the background

The progress dialog SHALL offer an "Im Hintergrund" action that closes it without affecting the synchronization. The app SHALL stay usable meanwhile. A dismissed dialog SHALL NOT reopen for the same run, but SHALL appear again for a later run.

#### Scenario: Sending the dialog to the background
- **WHEN** the user presses "Im Hintergrund" while a sync runs
- **THEN** the dialog closes
- **AND** the synchronization continues, and the sync status still shows it as running

#### Scenario: The next run shows the dialog again
- **WHEN** the user dismissed the dialog during one run
- **AND** a later synchronization runs longer than the delay
- **THEN** the progress dialog appears for the later run

### Requirement: The dialog closes on success and stays open on failure

When a synchronization shown in the dialog succeeds, the dialog SHALL show it as complete and close by itself after a short moment (about 1.5 seconds). When it fails, the dialog SHALL stay open, show the error message, and offer a "Schliessen" action.

#### Scenario: Successful sync
- **WHEN** a synchronization shown in the dialog finishes successfully
- **THEN** the dialog shows it as complete at 100 %
- **AND** closes by itself shortly afterwards

#### Scenario: Failed sync
- **WHEN** a synchronization shown in the dialog fails
- **THEN** the dialog stays open and shows the error message
- **AND** it closes only when the user presses "Schliessen"
