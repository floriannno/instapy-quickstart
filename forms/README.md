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

## Zuordnung zum GoHighLevel-Kontakt (Link-Parameter)

Der Link kann Kontaktdaten mitgeben, die das Formular vorbelegt und unverändert an den
Webhook weiterreicht. Das funktioniert nur, wenn der Link aus GoHighLevel heraus
verschickt wird (Instagram-DM über die GHL-Konversationen), weil nur dort die
Merge-Felder gefüllt werden:

```
https://…/instagram-qualifizierung.html?c={{contact.id}}&name={{contact.first_name}}
```

- `c` (auch `contact_id`) → Feld `contact_id` im Webhook. Der Workflow aktualisiert
  damit den bestehenden Kontakt per ID, statt über E-Mail/Telefon zu raten.
- `name`, `email`, `ig` → Vorname, E-Mail bzw. Instagram-Name vorbelegt (`ig` nur, wenn
  ihr den Instagram-Namen in einem Custom Field pflegt).

Wird der Link manuell aus der Instagram-App verschickt, ist `contact_id` leer. Dann
bleibt zum Zuordnen nur, was die Person selbst eintippt: Instagram-Name (Frage 1,
Feld `instagram`), E-Mail und Telefon (letzter Schritt).

## Ablauf (23 Seiten, ca. 8 Minuten)

Design: Farben und Schriften der MyBodyMind-Seiten (Plus Jakarta Sans, Inter, Petrol/Gold/Creme).
Die Fortschrittsanzeige zählt alle Seiten („Seite 3 von 23“).
Lange Wörter werden per weicher Trennstelle umbrochen („Rücken-schmerzen“), nie mitten im Wort;
keine Antwort braucht mehr als zwei Zeilen (automatisch geprüft ab 320px Breite).


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
12. Story-Seite: Dominiks Geschichte, Kennzahlen-Box (1.200+ begleitete Menschen,
    10 Jahre selbst betroffen, 400.000+ Follower) und drei Kundenstimmen im Stil
    der Kompass-Seite (Sterne, Überschrift, Zitat, „verifizierte Bewertung“)
13. Eigene Seite „Die 7 Säulen deiner Schmerzfreiheit“ mit der nummerierten Übersicht
14. 7-Säulen-Check: je Säule zwei Auswahlfragen und eine Regler-Frage (1–10),
    übernommen aus der Schmerz- & Symptomanalyse (Bewegung, Nervensystem & Psyche,
    Stress & Achtsamkeit, Ernährung & Darmgesundheit, Regeneration & Schlaf,
    Soziales Umfeld, Schmerzverständnis)
15. Investitionsbereitschaft (Bis 1.000 € / 1.000–3.000 € / 3.000–5.000 € / Mehr als 5.000 €)
16. E-Mail (Pflicht), Telefon (optional), Bestätigung → „Bewerbung absenden“

Texte, Antwortoptionen und Beträge lassen sich direkt im `STEPS`-Array im Script anpassen.
