const fs = require('fs');
const path = require('path');

async function run() {
  const apiKey = process.env.GEMINI_API_KEY;
  const filePath = path.join(process.cwd(), 'public', 'raport.json');

  try {
    // ZMIANA: v1 -> v1beta (to rozwiązuje Twój błąd 404)
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: "Podaj 5 meczów piłkarskich na dziś. Odpowiedz TYLKO i WYŁĄCZNIE czystym kodem JSON (bez 
http://googleusercontent.com/immersive_entry_chip/0

---

### Dlaczego to zadziała?
Błąd `404 NOT_FOUND` oznaczał, że pukałeś do drzwi o numerze `v1`, ale model Gemini 1.5 Flash mieszka w pokoju obok, pod numerem `v1beta`. Zmiana tego jednego słowa w linku sprawi, że Google „rozpozna” Twój klucz i model.

### Co teraz?
1. Podmień kod w **`scripts/generate.js`** na ten powyższy.
2. Zrób **Commit changes**.
3. Wejdź w **Actions** i odpal **Run workflow**.

Gdy robot skończy, odśwież stronę. Tym razem w logach pod hasłem „LOG Z AI” powinieneś zobaczyć prawdziwe dane meczów zamiast komunikatu o błędzie!

**Czy po zmianie na `v1beta` logi na GitHubie w końcu pokazują listę meczów?**
