// api/generate.js

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
- Analizuj także ligi top 5 

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
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Brak autoryzacji' });
  }

  try {
    const dzisiaj = new Date().toLocaleDateString('pl-PL', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      timeZone: 'Europe/Warsaw'
    });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("Brak klucza GEMINI_API_KEY w ustawieniach Vercel");
    }

    // Używamy darmowego modelu Flash
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    
    const geminiRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{
          role: "user",
          parts: [{ text: `Dzisiaj jest ${dzisiaj}. Przeszukaj internet, znajdź mecze piłkarskie na dziś i wygeneruj raport bukmacherski jako JSON.` }]
        }],
        // Zostawiamy wyszukiwarkę, ale usuwamy konfliktujący responseMimeType
        tools: [{ googleSearch: {} }],
        generationConfig: {
          temperature: 0.7
        }
      })
    });

    if (!geminiRes.ok) {
      const err = await geminiRes.text();
      throw new Error(`Gemini API error: ${geminiRes.status} — ${err}`);
    }

    const geminiData = await geminiRes.json();
    const odpowiedzTekst = geminiData.candidates[0].content.parts[0].text;

    // Parsujemy odpowiedź ręcznie, wycinając sam JSON
    const jsonMatch = odpowiedzTekst.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Brak JSON w odpowiedzi Gemini');

    const raport = JSON.parse(jsonMatch[0]);
    raport.wygenerowano = new Date().toISOString();

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
