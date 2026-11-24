# Legyen Ön is milliomos? – webes kvízjáték

Tévére vetíthető, egérrel vezérelhető kvízjáték AI-kérdésekkel. **Nincs szerver**: tiszta statikus weboldal
, a GitHub Pages közvetlenül kiszolgálja; az AI-t a böngésző hívja.

## Használat

Nyisd meg a közzétett oldalt, vagy helyben: `python3 -m http.server 8080` a mappában.
Teljes képernyő: ⛶ gomb.

1. **Téma:** Film, Sport, Általános műveltség, Politika.
2. **Fődíj:** forint vagy euró, szabadon megadható; a 15 szint a klasszikus arányok szerint skálázódik (5. és 10. kérdésnél garantált összeg).
3. **AI-asszisztens:** Claude, ChatGPT (OpenAI), Gemini vagy OpenAI-kompatibilis szolgáltatás (OpenRouter, helyi Ollama stb. – ha engedi a böngészős hívást, CORS).
   Az API-kulcsot a játékmester adja meg; csak a böngészőlapban él (sessionStorage), közvetlenül a szolgáltatóhoz megy.
   Kulcs nélkül a **Demó** mód 15 beépített kérdéssel indul.
4. **Menet:** válasz kijelölése → *Végleges válasz* → *Felfedés* → *Tovább*. Segítségek: 50:50, telefon (30 mp), közönség.
5. **Forrás ellenőrzés:** felfedés után az AI függetlenül ellenőrzi a választ (megerősítve / kétséges / hibás, indoklás, források), plusz Wikipédia- és keresőlink. Az AI is tévedhet.

## Közzététel GitHub Pages-en

A `.github/workflows/pages.yml` a `main` ágra kerülő változásokkor kiteszi az oldalt.
Egyszeri beállítás: Settings → Pages → **Source: GitHub Actions**. Az API-kulcs nincs az oldalban, azt mindenki maga adja meg.
