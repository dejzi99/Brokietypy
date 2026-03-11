// api/generate.js

export const config = { maxDuration: 60 };

const SYSTEM_PROMPT = `
Działasz jako zaawansowany analityk rynków bukmacherskich i detektor anomalii sportowych.

ZADANIE: Przeszukaj internet i znajdź wszystkie mecze piłkarskie na DZISIAJ na całym świecie.
Skup się na ligach niszowych i egzotycznych (Azja, CONCACAF, Ameryka Południowa, Afryka).
Wytypuj 5–8 najlepszych value betów.

SZUKAJ anomalii:
• Gwałtowne spadki kursów (dropping odds)
• Rozbieżności H2H vs aktualne kursy
• Niszowe ligi gdzie rynek się myli

Odpowiedz w formacie JSON (TYLKO JSON, bez żadnego tekstu przed ani po):
{
  "wygenerowano": "YYYY-MM-DD HH:MM",
  "typy": [
    {
      "id": 1,
      "liga": "nazwa ligi",
      "mecz": "Drużyna A vs Drużyna B",
      "godzina": "HH:MM CET",
      "typ": "np. Over 2.5 goli",
      "kurs": "~1.75",
      "ruch_kursu": "1.90 → 1.75",
      "analiza": "2-3 zdania uzasadnienia z liczbami",
      "value": "wysokie"
    }
  ],
  "podsumowanie": "Krótkie 2-3 zdania podsumowania dnia"
}

Dla pola "value" używaj wyłącznie: "wysokie", "umiarkowane" lub "spekulatywne".
`;

export default async function handler(req, res) {
  // 1. Zabezpieczenie przed nieautoryzowanym wywołaniem z zewnątrz
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Brak autoryzacji' });
  }

  try {
    const dzisiaj = new Date().toLocaleDateString('pl-PL', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      timeZone: 'Europe/Warsaw'
    });

    // 2. Wywołanie sztucznej inteligencji
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'interleaved-thinking-2025-05-14'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{
          role: 'user',
          content: `Dzisiaj jest ${dzisiaj}. Przeszukaj internet, znajdź mecze piłkarskie na dziś i wygeneruj raport bukmacherski jako JSON.`
        }]
      })
    });

    if (!claudeRes.ok) {
      const err = await claudeRes.text();
      throw new Error(`Claude API error: ${claudeRes.status} — ${err}`);
    }

    const claudeData = await claudeRes.json();

    // 3. Wyciągnięcie tekstu z odpowiedzi
    const teksty = claudeData.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');

    // 4. Parsowanie JSON z odpowiedzi Claude
    const jsonMatch = teksty.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Brak JSON w odpowiedzi Claude');

    const raport = JSON.parse(jsonMatch[0]);
    raport.wygenerowano = new Date().toISOString();

    // 5. Zapis do bazy danych Vercel KV
    const { kv } = await import('@vercel/kv');
    await kv.set('raport:latest', JSON.stringify(raport));
    await kv.set(`raport:${new Date().toISOString().split('T')[0]}`, JSON.stringify(raport));

    console.log(`✅ Raport wygenerowany: ${raport.typy?.length} typów`);
    return res.status(200).json({ success: true, typy: raport.typy?.length });

  } catch (err) {
    console.error('❌ Błąd generowania raportu:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
