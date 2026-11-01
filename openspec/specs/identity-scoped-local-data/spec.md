# identity-scoped-local-data Specification

## Purpose

Local data is the source of truth in Kellermeister and is re-homed to whichever Pod the user is logged into, so the local store must belong to exactly one identity. This capability ties the store to the WebID last used on the device: on a login with a different WebID the user chooses which data to keep — either the local data is deleted and the new Pod's data is loaded, or the local data is handed to the new identity and replaces the new Pod's Kellermeister data — so that one identity's data is never shown to, nor synchronized into the Pod of, another without the user's choice. A first login on a device is not a switch: data created offline before authenticating belongs to that same user and survives.

## Requirements

### Requirement: Local data belongs to the WebID last used on the device
The system SHALL treat the locally stored data as belonging to the WebID last used to authenticate on this device, recorded as the persisted WebID. When a session is established for a WebID that differs from the recorded one, the system SHALL apply the user's choice of which data to keep before the new session is used — that is, before the Pod container base is resolved and before any synchronization run. When the user keeps the Pod's data, the local data SHALL be deleted. When the user keeps the local data, it SHALL become the new WebID's data and the previous identity's Pod SHALL NOT be written to. Local data that the user did not choose to keep SHALL NOT be readable by a session for a different WebID, and SHALL NOT be synchronized into a different WebID's Pod. If the chosen outcome cannot be carried out, the system SHALL NOT adopt the session and SHALL inform the user why, rather than proceeding with the previous identity's data in place.

#### Scenario: Logging in with a different WebID deletes the previous identity's data
- **WHEN** a session is established for a WebID that differs from the recorded one and the user chooses to keep the Pod's data
- **THEN** the local data of the previous identity is deleted before the new session is used
- **AND** no cellar, bottle, product, or order of the previous identity is readable by the new session
- **AND** nothing belonging to the previous identity is synchronized into the new WebID's Pod

#### Scenario: Keeping the local data hands it to the new identity
- **WHEN** a session is established for a WebID that differs from the recorded one and the user chooses to keep the local data
- **THEN** no local data is deleted
- **AND** the local cellars, bottles, products and orders are shown to the new session
- **AND** the previous identity's Pod is not modified

#### Scenario: The session is not adopted when the deletion cannot be carried out
- **WHEN** a session is established for a different WebID, the user chooses to keep the Pod's data, but the local data cannot be deleted (for example because another tab of the application holds the local database open)
- **THEN** the session is not adopted
- **AND** the user is informed that the data could not be deleted and what to do about it
- **AND** the previous identity's data remains intact, so the switch can be retried

#### Scenario: A sync started during the switch does nothing
- **WHEN** a synchronization is triggered for the new session while the switch is still being settled
- **THEN** nothing is read from or written to any Pod
- **AND** a synchronization the user asked for still runs once the switch is complete

#### Scenario: Logging in with the same WebID changes nothing
- **WHEN** a session is established for the same WebID as the recorded one
- **THEN** no local data is deleted
- **AND** no choice is offered

#### Scenario: First login on a device keeps the data created before it
- **WHEN** a session is established and no WebID has been recorded on this device yet
- **THEN** no local data is deleted and no choice is offered
- **AND** data created offline before logging in remains available, so it can be synchronized to the Pod

### Requirement: The user is warned before local data is deleted
On a WebID switch the system SHALL ask the user which data to keep — the local data or the new Pod's data — and SHALL change nothing until the user has chosen. The choice SHALL state what is deleted: the local data, of which data not yet synchronized to the previous Pod is lost, or the new Pod's Kellermeister data. It SHALL show how many cellars and bottles are stored locally. Where the WebID is known before the login flow starts, the system SHALL ask then. It SHALL NOT ask again for the same switch.

#### Scenario: Warning precedes the login flow when the WebID is known in advance
- **WHEN** the user selects a WebID for login that differs from the recorded one
- **THEN** the user is asked whether to keep the local data or the new Pod's data, before the login flow navigates away from the application
- **AND** the question states the number of locally stored cellars and bottles and what each choice deletes

#### Scenario: Cancelling before login leaves everything untouched
- **WHEN** the user is asked before the login flow starts and cancels
- **THEN** no login is started and no data is deleted, locally or on any Pod
- **AND** the previously recorded WebID and its data remain unchanged

#### Scenario: Cancelling after a session was established does not adopt the session
- **WHEN** a session has been established for a different WebID and the user cancels the choice
- **THEN** no data is deleted, locally or on any Pod
- **AND** the session is not adopted: the system logs out and the previous identity's data remains available

#### Scenario: A confirmed switch is not confirmed twice
- **WHEN** the user has chosen before the login flow started and the session is then established for that WebID
- **THEN** the chosen outcome is carried out without asking again

#### Scenario: A choice for one WebID does not apply to another
- **WHEN** the user has chosen for one WebID before the login flow, but the session is established for a different WebID
- **THEN** the user is asked again for the WebID actually authenticated

### Requirement: Scope of the local deletion
The deletion SHALL cover the locally stored domain data (cellars, bottles, products, orders), the locally stored session metadata (the recorded WebID, the last synchronization date, and any remembered synchronization request), and the persisted Pod container base, including any copy of that base held in memory. The deletion SHALL NOT remove the list of WebIDs offered for login, which is device-level convenience state rather than data belonging to an identity. The deletion SHALL be idempotent, so re-running it on already-absent state succeeds without error.

#### Scenario: Identity-scoped state is gone after the switch
- **WHEN** the deletion has been carried out for a WebID switch
- **THEN** no domain data of the previous identity remains
- **AND** the last synchronization date and any remembered synchronization request are gone
- **AND** the Pod container base is treated as unresolved, so the new session resolves it afresh rather than reusing the previous identity's container

#### Scenario: The login WebID list survives the switch
- **WHEN** the deletion has been carried out
- **THEN** the list of WebIDs offered for login still contains the entries the user had typed, including the previous WebID

#### Scenario: Deleting already-absent state succeeds
- **WHEN** the deletion runs against state that is already absent or was only partly written
- **THEN** it completes without error

### Requirement: The application starts clean after a switch
After the local data was deleted because the user kept the Pod's data, the system SHALL present the state of a fresh installation authenticated as the new WebID: no data of the previous identity is shown, the recorded WebID is the new one, and the well-known cellars exist as they do on a fresh start. Cached read models and bootstrap state from before the deletion SHALL NOT be served afterwards.

#### Scenario: No stale data is shown after the switch
- **WHEN** the deletion has been carried out and the application is usable again
- **THEN** the cellar, bottle, product, and order views show no data of the previous identity
- **AND** the well-known cellars are present as on a fresh start

#### Scenario: The new WebID becomes the recorded identity
- **WHEN** the deletion has been carried out for a switch to a new WebID
- **THEN** the recorded WebID is the new one
- **AND** a subsequent start with that same WebID neither asks nor deletes anything

#### Scenario: An interrupted switch does not adopt the previous identity's data
- **WHEN** the deletion completes but recording the new WebID does not
- **THEN** the next login is treated as a first login on the device
- **AND** no data of the previous identity is presented as belonging to the new WebID

### Requirement: Keeping the local data replaces the new Pod's Kellermeister data
When the user keeps the local data, the system SHALL erase the Kellermeister cellars, bottles, products and orders on the new Pod and then upload all local data to it. Nothing else on the new Pod SHALL be deleted, including the Kellermeister order inbox. The previous Pod SHALL NOT be modified. Nothing SHALL be uploaded before the erase has completed.

#### Scenario: The new Pod ends up with exactly the local data
- **WHEN** the user keeps the local data, the new Pod already holds Kellermeister data, and the first sync after the switch completes
- **THEN** the new Pod's cellars, bottles, products and orders are exactly the local ones
- **AND** none of the new Pod's previous Kellermeister data is shown locally or remains on the Pod

#### Scenario: Other Pod data is untouched
- **WHEN** the new Pod's Kellermeister data is erased
- **THEN** resources outside the Kellermeister cellars, bottles, products and orders containers, including the Kellermeister order inbox, are unchanged

#### Scenario: Local references point to the new Pod
- **WHEN** the local data has been uploaded to the new Pod
- **THEN** every bottle refers to its cellar and product on the new Pod, and no resource refers to the previous Pod

### Requirement: An interrupted local-data switch is completed before any upload
The system SHALL persist that a switch keeping the local data is pending until its erase has completed. While it is pending, every sync SHALL first complete the erase and SHALL NOT upload or download data before that. Completing it again after an interruption SHALL NOT delete data that the switch already uploaded.

#### Scenario: The app is closed between login and the first sync
- **WHEN** the user kept the local data and the app is closed before the first sync completed
- **THEN** the next sync first erases the new Pod's Kellermeister data and then uploads the local data
- **AND** no data of the new Pod's previous Kellermeister data is downloaded

#### Scenario: Interrupted during the upload
- **WHEN** the erase has completed and the upload is interrupted
- **THEN** the next sync uploads the remaining local data without erasing what was already uploaded

#### Scenario: Pending switch for a different session
- **WHEN** a switch keeping the local data is pending for one WebID and a sync runs in a session for another WebID
- **THEN** the sync does not run and nothing is erased
