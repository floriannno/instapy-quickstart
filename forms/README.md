# Instagram-Qualifizierungsformular („Schmerzfrei-Check“)

`instagram-qualifizierung.html` ist das Formular, das die Instagram-Opener neuen
Followern schicken. Es ist eine einzelne, eigenständige HTML-Datei (Fotos sind
eingebettet) und läuft auf jedem Webspace – einfach hochladen und den Link teilen.

## Einrichten

Am Anfang des `<script>`-Blocks steht die Konfiguration:

```js
var CONFIG = {
  webhookUrl: "https://services.leadconnectorhq.com/hooks/…",  // GoHighLevel "Eingehender Webhook"
  instagramHandle: ""    // euer Instagram-Name ohne @ (für den DM-Button am Ende)
};
```

- **webhookUrl gesetzt** (aktuell: der GoHighLevel-Workflow „fragebogen“): Die Antworten
  werden als JSON per POST an die URL geschickt. In GoHighLevel einmal das Formular
  absenden und dann im Trigger „Beispielanfragen abrufen“ klicken, um die Felder
  zuzuordnen. Felder: `vorname`, `instagram`, `geschlecht`, `email`, `telefon`,
  `bestaetigung`, `symptome`, `symptome_sonstiges`, `seit`, `schmerzstufe`,
  `bisher_probiert`, `bisher_probiert_sonstiges`, `was_geholfen`, `woran_gescheitert`,
  `veraenderungswunsch`, `beruf`, `arbeitszeit`, `erstes_ohne_beschwerden`,
  `in_behandlung`, `minuten_pro_tag`, `ziel_bis`, `investition`, `zeitpunkt`, `quelle`,
  `zusammenfassung` (alles als lesbarer Text).
- **webhookUrl leer** (oder Versand fehlgeschlagen): Die Person bekommt am Ende ihre
  Antworten als Text mit „Antworten kopieren“ und einem DM-Button und schickt sie
  selbst per Instagram-Nachricht.

## Ablauf (13 Fragen + 1 Infoseite, ca. 5 Minuten)

1. Vorname, Instagram-Name, weiblich/männlich/divers
2. Symptome (Mehrfachauswahl inkl. Tinnitus, Müdigkeit, Depressionen, Trauer,
   Unbeweglichkeit, Unzufriedenheit) + Freifeld für Diagnose
3. Seit wann? (< 3 Monate, 3–12 Monate, 1–5 Jahre, > 5 Jahre)
4. Stärke der Beschwerden 0–10
5. Bisher probiert (Mehrfachauswahl, „Anderes“ mit Freifeld) + Reflexion als Textfeld
   (mind. 100 Zeichen): Was hat wirklich geholfen?
6. Woran ist es bisher gescheitert? (Mehrfachauswahl)
7. Wie sehr willst du Veränderung? 1–10
8. Beruf (Freitext) + Wochenstunden (Auswahl)
9. Freitext (mind. 80 Zeichen): In 6–12 Monaten beschwerdefrei – was wäre das Erste?
10. In Behandlung? (Auswahl) + Regler: Minuten pro Tag für die Gesundheit
11. Bis wann soll das Ziel erreicht sein?
12. Infoseite: ganzheitlicher Ansatz, 1.200+ begleitete Menschen, selbst schmerzfrei,
    die 7 Säulen in Kurzform
13. Investitionsbereitschaft (Beträge zum Anklicken)
14. E-Mail (Pflicht), Telefon (optional), Bestätigung → „Bewerbung absenden“

Texte, Antwortoptionen und Beträge lassen sich direkt im `STEPS`-Array im Script anpassen.
