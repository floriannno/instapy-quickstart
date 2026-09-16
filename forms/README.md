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

- **webhookUrl gesetzt** (aktuell: der GoHighLevel-Workflow „fragebogen“, Trigger 315c89e1…): Die Antworten
  werden als JSON per POST an die URL geschickt. In GoHighLevel einmal das Formular
  absenden und dann im Trigger „Beispielanfragen abrufen“ klicken, um die Felder
  zuzuordnen. Felder: `vorname`, `instagram`, `geschlecht`, `email`, `telefon`,
  `bestaetigung`, `symptome`, `symptome_sonstiges`, `seit`, `schmerzstufe`,
  `bisher_probiert`, `bisher_probiert_sonstiges`, `was_geholfen`, `woran_gescheitert`,
  `veraenderungswunsch`, `beruf`, `arbeitszeit`, `erstes_ohne_beschwerden`,
  `in_behandlung`, `minuten_pro_tag`, `ziel_bis`, `investition`, `zeitpunkt`, `quelle`,
  `zusammenfassung` (alles als lesbarer Text). Dazu je Säule drei Felder
  `saeule_<name>_frage1`, `saeule_<name>_frage2`, `saeule_<name>_skala` (1–10) mit
  `<name>` = bewegung, psyche, stress, ernaehrung, schlaf, sozial, schmerzverstaendnis.
- **webhookUrl leer** (oder Versand fehlgeschlagen): Die Person bekommt am Ende ihre
  Antworten als Text mit „Antworten kopieren“ und einem DM-Button und schickt sie
  selbst per Instagram-Nachricht.

## Ablauf (13 Fragen + Story-Seite + 7-Säulen-Check, ca. 8 Minuten)

1. Vorname, Instagram-Name, weiblich/männlich/divers
2. Symptome (Mehrfachauswahl inkl. Tinnitus, Müdigkeit, Depressionen, Trauer,
   Unbeweglichkeit, Unzufriedenheit) + Freifeld für Diagnose
3. Seit wann? (< 3 Monate, 3–12 Monate, 1–5 Jahre, > 5 Jahre)
4. Stärke der Beschwerden 0–10
5. Bisher probiert (Mehrfachauswahl, „Anderes“ mit Freifeld) + Reflexion als Textfeld:
   Was hat wirklich geholfen?
6. Woran ist es bisher gescheitert? (Mehrfachauswahl)
7. Wie sehr willst du Veränderung? 1–10
8. Beruf (Freitext) + Wochenstunden (Auswahl)
9. Freitext: In 6–12 Monaten beschwerdefrei – was wäre das Erste?
10. In Behandlung? (Auswahl) + Regler: Minuten pro Tag für die Gesundheit
11. Bis wann soll das Ziel erreicht sein?
12. Story-Seite: Dominiks Geschichte in drei Sätzen (10 Jahre täglich Schmerzen,
    über 1.200 Menschen begleitet) + 3 Testimonial-Bilder (Frank, Maren, Anna-Maria)
13. 7-Säulen-Check: je Säule zwei Auswahlfragen und eine Regler-Frage (1–10),
    übernommen aus der Schmerz- & Symptomanalyse (Bewegung, Nervensystem & Psyche,
    Stress & Achtsamkeit, Ernährung & Darmgesundheit, Regeneration & Schlaf,
    Soziales Umfeld, Schmerzverständnis)
14. Investitionsbereitschaft (Beträge zum Anklicken)
15. E-Mail (Pflicht), Telefon (optional), Bestätigung → „Bewerbung absenden“

Texte, Antwortoptionen und Beträge lassen sich direkt im `STEPS`-Array im Script anpassen.
