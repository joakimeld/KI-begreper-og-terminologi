# KI-begreper og terminologi

> **Status: konsept / MVP.** Dette er en prototype for å teste ideen. Innhold, struktur og funksjonalitet kan endre seg.

Et oppslagsverk som forklarer KI-begreper kort og på godt norsk. Begrepene er sortert etter nivå og fagområde, slik at hver enkelt finner det som er relevant for egen kompetanse og rolle.

## Hva brukes siden til?

- **Lære vokabularet:** finn og forstå begreper du møter i KI-arbeid, fra «prompt» og «hallusinasjon» til «MCP» og «prompt injection».
- **Lære i ditt tempo:** velg nivå, fra 1 Nybegynner, 2 Viderekommende og 3 Avansert til 4 Ekspert.
- **Se det som er relevant for deg:** filtrer på rolle (for eksempel UX-designer, utvikler, arkitekt eller prosjektleder), fagområde og verktøy. Du kan også vise alle begrepene samlet.
- **Felles språk:** bruk samme ord og definisjoner i team, kundedialog og opplæring.
- **Spor kildene:** hvert begrep oppgir kilden definisjonen bygger på, som Teknologirådet, EUs KI-forordning, ISO/IEC, NIST, OWASP og forskningsartikler.

Definisjonene er kortet ned og skrevet om på egne ord. De er ikke direkte sitater. Ved bruk i kontrakter eller kundeleveranser: gå til primærkilden.

## Innhold

- 97 begreper fordelt på fire nivåer og ni fagområder
- 33 kilder, gruppert i kildelisten nederst på siden
- Sist oppdatert 5. oktober 2026

## Kjør lokalt

Siden er én HTML-fil uten byggesteg eller avhengigheter. Åpne `index.html` i en nettleser.

For å publisere med GitHub Pages: gå til *Settings → Pages*, velg branchen `main` og rotmappen `/`.

## Oppdatere begreper

Alle begreper, roller, fagområder og kilder ligger i `<script>`-blokken i `index.html`:

- `TERMS`: begrepene (navn, engelsk term, nivå, fagområder, verktøy, kilder og definisjon)
- `KILDER`: kildelisten
- `ROLLER`, `FAGOMRADER`, `VERKTOY`: filterverdiene

## Videre ideer

- Automatisk oppdatering av begreper via API eller KI
- Flere roller og fagområder
- Eksport til opplæringsmateriell
