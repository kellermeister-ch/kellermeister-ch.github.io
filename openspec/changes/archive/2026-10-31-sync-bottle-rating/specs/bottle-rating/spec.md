## ADDED Requirements

### Requirement: A bottle's rating is synchronised with the Pod
When a bottle that already exists on the Pod is rated, the next sync SHALL write the rating's value and date to the bottle's Pod resource. A device that pulls the bottle afterwards SHALL show the same rating.

#### Scenario: Rating reaches the Pod
- **WHEN** the user moves a bottle that is already on the Pod to Altglass with rating 3 and then syncs
- **THEN** the bottle's Pod resource contains the rating value 3 and the rating date

#### Scenario: Rating reaches another device
- **WHEN** a bottle was rated and synced on one device, and a second device that already has the bottle syncs
- **THEN** the second device shows the bottle's rating

#### Scenario: Unrated bottle unchanged
- **WHEN** a bottle without a rating is synced
- **THEN** no rating is written to its Pod resource

### Requirement: Ratings stored before the fix are repaired
A rating that is present on the device but was stored in the previous form SHALL still be shown, and SHALL be written in the synchronised form, so that the next sync brings it to the Pod. Each such bottle SHALL be repaired only once.

#### Scenario: Old-style local rating is pushed
- **WHEN** a device holds a bottle whose rating is only stored in the previous form, the bottles are loaded, and the user syncs
- **THEN** the bottle's Pod resource contains that rating's value and date

#### Scenario: Old-style rating still displayed
- **WHEN** a bottle with a rating in the previous form is shown
- **THEN** its rating is displayed with its value and date

#### Scenario: Repair happens once
- **WHEN** the bottles are loaded again after a bottle was repaired
- **THEN** the bottle is not written again
