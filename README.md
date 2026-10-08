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

- Begreper fordelt på fire nivåer og ni fagområder
- 33 kilder, gruppert i kildelisten nederst på siden
- Sist oppdatert: datoen vises automatisk og endres når nye begreper publiseres

## Kjør lokalt

Siden er statisk og har ingen byggesteg eller avhengigheter. Åpne `index.html` i en nettleser. Quizen er en egen side i `quiz.html`. Begrepene deles mellom sidene fra `terms.js`; de daglig oppdagede begrepene ligger i `auto-terms.js`.

For GitHub Pages: gå til *Settings → Pages* og velg **GitHub Actions** som build and deployment source. Workflowen publiserer oppslagsverket, quizen og de delte datafilene med Pages-deployhandlingen.

## Automatisk oppdatering med Gemini API

GitHub Actions kjører daglig og henter de offentlige HTTPS-kildene som er registrert i `KILDER` i `index.html`. Når synlig kildetekst endres, ber workflowen `gemini-2.5-flash` via Googles dokumenterte Interactions API om forslag. Modellen får sidens fire nivåer, fagområder, verktøy og kilde-ID-er; bare nye, validerte begreper med kildehenvisning til en endret kilde blir lagt til i `auto-terms.js` og committet til `main`. Interne kilder uten URL hentes ikke.

**Oppsett:** Opprett/velg Gemini API-nøkkel i [Google AI Studio](https://aistudio.google.com/apikey), og lagre den i repoet under *Settings → Secrets and variables → Actions* med navnet `GEMINI_API_KEY`. Workflowen stopper før den henter kilder hvis nøkkelen mangler. API-nøkkelen skal aldri legges i filer eller commits. Google AI Pro-abonnementet er ikke i seg selv Gemini API-nøkkel eller API-kvote; API-tilgang og gratis kvote er egne innstillinger i AI Studio/Cloud-prosjektet.

Google dokumenterer gratis input/output for utvalgte modeller, inkludert Gemini 2.5 Flash, men gratisnivået har begrensede RPM/TPM/RPD-kvoter, som kan endres eller bli utilgjengelige for prosjektet. For å unngå kostnader må API-nøkkelen tilhøre et prosjekt uten aktiv Cloud Billing; ikke aktiver fakturering for prosjektet. Workflowen gjør maksimalt én modellforespørsel per kjøring for inntil åtte endrede kilder og kan publisere høyst 20 begreper per kjøring. Den prøver på nytt inntil to ganger ved midlertidige API-feil og stopper med synlig feil ved vedvarende kvote- eller API-feil (ingen betalt fallback). Første kjøring behandler kildene i puljer på opptil åtte. Bare offentlige kildetekster sendes til modellen; ikke send personopplysninger eller konfidensielt materiale. Forespørselen bruker `store: false`, men Googles gratisvilkår kan fortsatt tillate bruk av innhold til produktforbedring og menneskelig gjennomgang. Siden nettstedet er offentlig og drives fra Norge/EØS, vurder også vilkårenes begrensning på gratis API-klienter som tilbys brukere i EØS, Storbritannia og Sveits; avklar med Google før bruk hvis denne statiske publiseringsflyten omfattes. Les [priser og kvoter](https://ai.google.dev/gemini-api/docs/pricing), [API-nøkler](https://ai.google.dev/gemini-api/docs/api-key) og [Gemini API-vilkårene](https://ai.google.dev/gemini-api/terms).

Workflowen trenger `contents: write`, `pages: write` og `id-token: write`, at repositoryets regler tillater GitHub Actions å oppdatere `main`, og at Pages-kilden er satt til **GitHub Actions**. Den committer kildehashene og eventuelle nye begreper direkte til `main`, og deployer deretter nettstedet med GitHub Pages Actions. Dette eksplisitte deploysteget er nødvendig fordi commits laget med `GITHUB_TOKEN` ikke starter et Pages-build automatisk. Direkte endringer i `index.html` eller `auto-terms.js` på `main` utløser også en deploy uten å kalle Gemini eller hente kildene. Kildeendringer uten nye begreper oppdaterer bare kildehashene og nettstedet deployeres bare når det finnes endringer. Feil med en kilde logges som advarsel og prøves på nytt neste dag; API- eller valideringsfeil stopper kjøringen uten å publisere ugyldige begreper.

Kildeinnhold behandles som ubetrodd data. Kildene uten offentlig URL (interne eller bransjebruk) polleres ikke.

## Manuell oppdatering

Eksisterende begreper og fagområder ligger i `terms.js`, som lastes av både `index.html` og `quiz.html`:

- `KI_TERMS`: begrepene (navn, engelsk term, nivå, fagområder, verktøy, kilder og definisjon)
- `KI_SUBJECTS`: fagområdene som brukes til quizfiltrering
- `KI_ROLES` og rollefordelingen: rollene og begrepstilknytningen som brukes av begge sidene
- `KILDER`: kildelisten
- `ROLLER`, `VERKTOY`: filterverdiene i oppslagsverket
- `auto-terms.js`: nye, automatisk oppdagede begreper (genereres av GitHub Actions)

Quizen har alltid ti blandede spørsmål. Hvert spørsmål får et synlig tidsbonusvindu på 10–30 sekunder som beregnes fra tekstmengden, nivået og spørsmålsformen. Vinduet påvirker bare tidsbonusen; det er fortsatt mulig å svare etter at nedtellingen er ferdig. Et riktig svar gir 100 grunnpoeng og opptil 100 tidsbonuspoeng; bonusen starter på 100 og teller ned i forhold til tiden som går, slik at den tilpassede tidsrammen ikke gir lengre spørsmål høyere mulig bonus. Feil svar gir 0 poeng. Hver quiz avgrenses til generell quiz, ett fagområde eller én rolle, og et valgfritt nivå. Når en avgrensning har færre enn ti relevante begreper, brukes noen begreper i mer enn én spørsmålsform for å fylle quizen. Resultatlistene er separate for hver fagområde-/rolle- og nivå-kombinasjon; resultatvisningen viser listen for den valgte quiztypen, og «Velg en annen quiz» lar deltakeren bytte kategori. Tidligere resultater uten tidsbonus beholdes i historikken og merkes separat. Deltakeren velger kallenavn; ikke bruk fullt navn eller e-postadresse. Resultater lagres bare i den lokale nettleseren, kan slås av og kan slettes derfra. Det finnes foreløpig ingen delt toppliste eller konto-/backendløsning.

## Videre ideer

- Flere roller og fagområder
- Eksport til opplæringsmateriell
