ToDo
===

### Prio 1

- [ ] E: Verifikation von Order TTLs via SHACL (mit jbang)
- [ ] S&E: Preis lookup review
- [ ] E: API Key für REST API
- [ ] E: in Einkäufe soll auch ein Löschen sein
- [ ] E: Backup Konzept
- [ ] E: bei Wechsel des Pods soll gefragt werden, ob die lokalen Daten gelöscht oder in den neuen Pod übernommen werden sollen
- [ ] E: In Einkäufe (order-page) sollen die Flaschen innerhalb eines Monats absteigend nach Datum sortiert sein, so dass die neusten Einkäufe zuerst angezeigt werden

### Prio 2

- [ ] Keller in Suche zu/aufklappbar machen
- [ ] Verwendung von WebMCP
- [ ] neue Seite Statistik:
  - Anzahl Rotweine, Weissweine, Roseweine, Sprudel (weiss, rot, rose), Gesamt und pro Keller
  - Weine trinkreif von - bis
  - Weinpreise pro Keller und Gesamt und von - bis
  - Weinbewertungen Top (3), (2), (1) 
- [ ] Client ID Metadata Document als JSON-LD (https://github.com/mfhepp/test_mime_types)
- [ ] Refresh Button
- [ ] E: Filter nach muss ausgetrunken werden --> lange (1sec) auf filter toggle drücken

### Prio 3

- [ ] Preis mit Komma oder Punkt als Dezimalzeichen aktzeptieren
- [ ] Funktion für Keller umbennen
- [ ] check for updates in Kellerinfo bei der Version
- [ ] Mobile Safari fehlt x in Search Input ([siehe Blog](https://www.w3tutorials.net/blog/input-type-search-no-longer-shows-cancel-button-x-under-ios/))

### Prio 4

- [ ] E2E Tests
- [ ] Code Quality
- [ ] Automated Testing
- [ ] Finder Extension/WebDAV to Solid Pod Bridge
- [ ] Solid Bootstrapping via WebID -> oidcIssuer(s) / storage(s) -> Type Indices

Done
---

- [x] E:Versionsnummer: 1.0.97-20261026-a879d43 anstatt 1.0.0-20261016-97-a879d43
- [x] E: wenn eine neue Version der App vorliegt, soll die App fragen, ob diese installiert werden soll
- [x] E: Fortschritt Anzeige bei Solid Sync
- [x] E: Anzeige "14 von 764 Flaschen" in Keller Seite mit Filter
- [x] E: in Quelle soll der Name des Sellars oder die PriceSource des OrderItems angezeigt werden
- [x] E: Keller Altglass nach "getrunken" sortiert
- [x] E: beim Editieren von einem der Felder Hersteller, Weinname, Jahrgang, Flaschengrösse soll der Name aktualisiert werden
- [x] E: Suche nach Bewertung ("top3" =findet alle Flaschen mit Rating = 3 etc.)
- [x] E: Suche nach Flaschengrösse ("ml 750")
- [x] E: Edit soll auch ein Feld für Währung anbieten
- [x] E: im Altglass Keller sollen Flaschen auch komplett gelöscht werden können
- [x] E: zu bestehenden Flaschen weitere hinzufügen
- [x] S: Dezimalstellen (number) für Preis bei Fotoeingabe statt Integer
- [x] S: Filter nach Weinfarbe und Weinart überdenken: Weinfarbe und Weinart müssen in Kombination sein
- [x] Monate im Einkauf zu/aufklappbar machen
- [x] E: Filter nach muss ausgetrunken werden --> via Suche "bis2026" (bisYYYY), aktuell ist es nur YYYY
- [-] Dezimalstellen des Preises werden nicht angezeigt (Soukai Bug?)
- [x] S: Profil umbennen und überarbeiten (Kellerprofil)
- [x] S: In Kellerseite immer Anzahl Flaschen anzeigen klein unterhalb des Kellernamens
- [x] E: Änderungen zu Produkt machen (im Keller, auf Flasche neues Icon "ändern", wenn icon Stift gedrückt)
- [x] E: Rating auf Bottle anstatt Product (: benötigt Beziehung Product -> Bottle)
- [X] E: Keller Kellerarbeit soll sich gleich wie alle Keller verhalten
- [x] E: Quelle (= product.orderitem.order.seller.name) muss in Produkt Details angezeigt werden
- [x] E: Menge muss auf ttl Menge gemappt werden
- [-] Icons für Suchen differenzieren
- [x] Upload Foto
- [x] Layout: Einkäufe ist Text zu nahe am Rand und Bullet Points wegnehmen
- [x] Filter für Text auf Einkäufe Seite
- [x] Profil Seite ist Text zu nahe am Rand
- [x] background color = #f2f2b6
- [x] Namen optimieren
- [x] Inventar optimieren
- [x] Foto-to-Order
- [x] Inrupt Setup
- [x] Icons einbauen
- [x] Login/Logout in Profil Seite
- [x] Einkäufe auch im Offline Zustand anzeigen
- [x] kein Sync bei Page Refresh
- [x] Local-first mit IndexedDB
- [x] Bei Login mit anderer WebID müssen die lokale gespeicherten Daten gelöscht werden
- [x] Migration auf Soukai-Bis
- [x] Inbox löscht bei Übernahme die ttl Files nicht
- [x] Filter für Weinart auf Keller Seite (✔) und Kellerarbeit (✔) Seite
- [x] Optimierung: Porto, Geschenkpackung, Rabatt, etc. aus Bestellung entfernen
- [x] Server von Python auf Quarkus migrieren
- [x] Upload von order.ttl(s) im UI
- [-] Startseite Styling und Einführung
- [-] Flasche(n) löschen
- [-] WebID löschen im Profil
- [x] App Styling (Layout, Farben, ...)
- [x] Refresh nach neuen Keller erstellen
- [x] Keller löschen im Profil
- [x] Eingang aus Foto via Email → Kellerknecht

- Solid Login via WebID
- Eingang aus Bestell-Email via Email (kellermeister@gmail.com)
- Kellerarbeit
