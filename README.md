Kellermeister
===

Kellermeister ist eine Web Applikation (PWA) für die Verwaltung eines oder mehrerer Weinkeller.

Design
---

Das Design ist mit Figma Make gemacht: https://www.figma.com/make/XKXwvF1ejQY0MFQIrjBvui/Kellermeister?p=f

Authentication
---

#### Login

#### Logout

Logout von der Applikation vs von dem Identity Provider!

Routing
---

Für das Routing wird der [Vaadin Router] verwendet.


Modelling
---

Für die Modellierung der Solid Daten wird [Soukai] verwendet. Solid unterscheidet zwischen Dokumenten und Containern.

"The way that models are stored in documents can be configured with relations." see [https://soukai.js.org/guide/solid-protocol/solid-models.html](https://soukai.js.org/guide/solid-protocol/solid-models.html#models-vs-documents).

#### Soukai Solid

Nach einem erfolgreichen Login wird in solid.ts das Benutzer Profil ausgehend von der webId geladen. Mit `User.find(webId)` wird ein GET Request auf `http://localhost:3000/edwin/profile/card` ausgelöst.
Das Benutzer Profil ist ein Objekt mit den Keys `name`, `storageUrl` (e.g. `http://localhost:3000/edwin/`) und `url`. Der Key `url` enthält die webId.

- card: /edwin/profile/card
- profile: /edwin/profile/ 
- edwin: /edwin/

##### card: /edwin/profile/card

```ttl
@prefix schema: <http://schema.org/>.
@prefix foaf: <http://xmlns.com/foaf/0.1/>.
@prefix vcard: <http://www.w3.org/2006/vcard/ns#>.
@prefix solid: <http://www.w3.org/ns/solid/terms#>.
@prefix acl: <http://www.w3.org/ns/auth/acl#>.

<>
    a foaf:PersonalProfileDocument;
    foaf:maker <http://localhost:3000/edwin/profile/card#me>;
    foaf:primaryTopic <http://localhost:3000/edwin/profile/card#me>.

<http://localhost:3000/edwin/profile/card#me>
    solid:oidcIssuer <http://localhost:3000/>;
    a schema:Person, foaf:Person;
    vcard:fn "Edwin";
    foaf:name "Edwin Steiner";
    acl:trustedApp
        [
            acl:mode acl:Append, acl:Control, acl:Read, acl:Write;
            acl:origin <https://solid-file-manager.theodi.org/>
        ].
```

##### profile: /edwin/profile/

```ttl
@prefix dc: <http://purl.org/dc/terms/>.
@prefix ldp: <http://www.w3.org/ns/ldp#>.
@prefix posix: <http://www.w3.org/ns/posix/stat#>.
@prefix xsd: <http://www.w3.org/2001/XMLSchema#>.

<> a ldp:Container, ldp:BasicContainer, ldp:Resource;
    dc:modified "2025-12-30T15:09:23.000Z"^^xsd:dateTime.
<card> a ldp:Resource, <http://www.w3.org/ns/iana/media-types/text/turtle#Resource>;
    dc:modified "2025-12-30T15:09:23.000Z"^^xsd:dateTime.
<> posix:mtime 1767107363;
    ldp:contains <card>.
<card> posix:mtime 1767107363;
    posix:size 755.
``` 

##### edwin: /edwin/

```ttl
@prefix dc: <http://purl.org/dc/terms/>.
@prefix ldp: <http://www.w3.org/ns/ldp#>.
@prefix posix: <http://www.w3.org/ns/posix/stat#>.
@prefix xsd: <http://www.w3.org/2001/XMLSchema#>.

<> a <http://www.w3.org/ns/pim/space#Storage>, ldp:Container, ldp:BasicContainer, ldp:Resource;
    dc:modified "2026-01-02T10:11:23.000Z"^^xsd:dateTime.
<d26ebdeb-06eb-4bbd-ae9e-1e8e85dc7e31> a ldp:Resource, <http://www.w3.org/ns/iana/media-types/text/html#Resource>;
    dc:modified "2025-12-30T12:55:48.000Z"^^xsd:dateTime.
<private1/> a ldp:Container, ldp:BasicContainer, ldp:Resource;
    dc:modified "2025-12-30T17:34:54.000Z"^^xsd:dateTime.
<tasks/> a ldp:Container, ldp:BasicContainer, ldp:Resource;
    dc:modified "2026-01-03T16:00:48.000Z"^^xsd:dateTime.
<public1/> a ldp:Container, ldp:BasicContainer, ldp:Resource;
    dc:modified "2025-12-30T10:54:09.000Z"^^xsd:dateTime.
<kellermeister/> a ldp:Container, ldp:BasicContainer, ldp:Resource;
    dc:modified "2025-12-30T10:58:04.000Z"^^xsd:dateTime.
<README> a ldp:Resource, <http://www.w3.org/ns/iana/media-types/text/markdown#Resource>;
    dc:modified "2025-12-15T18:20:19.000Z"^^xsd:dateTime.
<profile/> a ldp:Container, ldp:BasicContainer, ldp:Resource;
    dc:modified "2025-12-30T15:09:23.000Z"^^xsd:dateTime.
<scripts/> a ldp:Container, ldp:BasicContainer, ldp:Resource;
    dc:modified "2025-12-30T12:55:49.000Z"^^xsd:dateTime.
<folder1/> a ldp:Container, ldp:BasicContainer, ldp:Resource;
    dc:modified "2025-12-30T10:50:42.000Z"^^xsd:dateTime.
<dokieli/> a ldp:Container, ldp:BasicContainer, ldp:Resource;
    dc:modified "2025-12-30T12:58:01.000Z"^^xsd:dateTime.
<media/> a ldp:Container, ldp:BasicContainer, ldp:Resource;
    dc:modified "2025-12-30T12:55:49.000Z"^^xsd:dateTime.
<> posix:mtime 1767348683;
    ldp:contains <d26ebdeb-06eb-4bbd-ae9e-1e8e85dc7e31>, <private1/>, <tasks/>, <public1/>, <kellermeister/>, <README>, <profile/>, <scripts/>, <folder1/>, <dokieli/>, <media/>.
<d26ebdeb-06eb-4bbd-ae9e-1e8e85dc7e31> posix:mtime 1767099348;
    posix:size 2138.
<private1/> posix:mtime 1767116094.
<tasks/> posix:mtime 1767456048.
<public1/> posix:mtime 1767092049.
<kellermeister/> posix:mtime 1767092284.
<README> posix:mtime 1765822819;
    posix:size 980.
<profile/> posix:mtime 1767107363.
<scripts/> posix:mtime 1767099349.
<folder1/> posix:mtime 1767091842.
<dokieli/> posix:mtime 1767099481.
<media/> posix:mtime 1767099349.

```

### Beipiele 

- [Ramen] : Soukai
- [Solid Focus] : Soukai & Aerogel
- [Media Kraken]


UI Komponenten Library
---

[Web Awesome] ?


[Solid Data Modelling Skill]: https://github.com/solid/solid-llm-skills/blob/main/solid/data-modelling.md
[Wine Ontology]: https://github.com/UCDavisLibrary/wine-ontology/blob/master/wine-ontology.org
[Beverage Ontology]: https://ceur-ws.org/Vol-2969/paper45-FoisShowCase.pdf
[Inrupt Solid Authentication]: https://docs.inrupt.com/guides/authentication-in-solid
[Vaadin Router]: https://vaadin.github.io/router/API/index.html
[Soukai]: https://soukai.js.org/
[Soukai Sources]: https://soukai.js.org/
[Soukai Solid Sources]: https://github.com/NoelDeMartin/soukai
[Ramen]: https://github.com/NoelDeMartin/ramen
[Solid Focus]: https://github.com/noeldemartin/solid-focus
[Media Kraken]: https://github.com/NoelDeMartin/media-kraken
[Web Awesome]: https://webawesome.com/
[Figma Make Tutorial]: https://www.youtube.com/watch?v=LF-dUF-EYBs
[Eruda]: https://github.com/liriliri/eruda