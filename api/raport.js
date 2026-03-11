// api/raport.js
// Zwraca aktualny raport z Vercel KV jako JSON

export default async function handler(req, res) {
  // CORS — pozwól frontendowi na tym samym domenie
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');

  try {
    const { kv } = await import('@vercel/kv');
    const raw = await kv.get('raport:latest');

    if (!raw) {
      return res.status(404).json({
        error: 'Brak raportu',
        info: 'Raport generuje się codziennie o 7:00 UTC. Możesz go wygenerować ręcznie wywołując /api/generate?secret=TWOJ_SECRET'
      });
    }

    const raport = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return res.status(200).json(raport);

  } catch (err) {
    console.error('KV error:', err.message);
    return res.status(500).json({ error: 'Błąd bazy danych', details: err.message });
  }
}
