# Instagram-Qualifizierungsformular („Schmerzfrei-Check“)

`instagram-qualifizierung.html` ist das Formular, das die Instagram-Opener neuen
Followern schicken. Es ist eine einzelne, eigenständige HTML-Datei (Fotos sind
eingebettet) und läuft auf jedem Webspace – einfach hochladen und den Link teilen.

## Einrichten

Am Anfang des `<script>`-Blocks steht die Konfiguration:

```js
var CONFIG = {
  webhookUrl: "",        // Zapier "Catch Hook", Make-Webhook oder eigener Endpunkt
  instagramHandle: "",   // euer Instagram-Name ohne @ (für den DM-Button am Ende)
  minChars: 120          // Mindestlänge der beiden Freitext-Antworten
};
```

- **webhookUrl gesetzt:** Die Antworten werden per POST (Formular-Felder) an die
  URL geschickt. Felder: `vorname`, `instagram`, `schmerzen`, `schmerzen_sonstiges`,
  `seit`, `schmerzstufe`, `bisher_probiert`, `veraenderungswunsch`, `zukunft`,
  `investition`, `zeitpunkt`, `quelle`, `zusammenfassung` (alles als lesbarer Text).
- **webhookUrl leer** (oder Versand fehlgeschlagen): Die Person bekommt am Ende ihre
  Antworten als Text mit „Antworten kopieren“ und einem DM-Button und schickt sie
  selbst per Instagram-Nachricht.

## Ablauf (8 Fragen, ca. 3 Minuten)

1. Vorname + Instagram-Name
2. Wo tut es weh? (Mehrfachauswahl + Freifeld für Diagnose)
3. Seit wann?
4. Schmerzstufe 0–10
5. Freitext: Was wurde bisher probiert? (mind. 120 Zeichen)
6. Wie stark ist der Wunsch nach Veränderung?
7. Freitext: Was wäre in 6 Monaten ohne Schmerzen anders? (mind. 120 Zeichen)
8. Investitionsbereitschaft (Beträge zum Anklicken, ganz am Ende)

Texte, Antwortoptionen und Beträge lassen sich direkt im `STEPS`-Array im Script anpassen.
