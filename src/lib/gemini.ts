import { GoogleGenAI } from "@google/genai";

export async function extractTransactionsFromImage(file: File) {
  const apiKey = "AIzaSyClSRdlL3tptvCFuEWDXC8HcV-GYw7OXzY";
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not defined. Please configure it in your environment.");
  }

  const ai = new GoogleGenAI({ apiKey });
  
  const base64Data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const base64String = base64Data.split(',')[1];
  
  const currentYear = new Date().getFullYear();
  // Robust parsing fallbacks for numbers with commas/dots
  const parseAmount = (val: any): number => {
    if (typeof val === 'number') return Math.abs(val);
    if (!val) return 0;
    let str = String(val).trim();
    // Locate last comma and dot to determine the decimal separator role
    const lastComma = str.lastIndexOf(',');
    const lastDot = str.lastIndexOf('.');
    if (lastComma > lastDot && lastComma !== -1) {
      // e.g. 1.234,56 -> 1234.56
      str = str.replace(/\./g, '').replace(',', '.');
    } else if (lastDot > lastComma && lastDot !== -1) {
      // e.g. 1,234.56 -> 1234.56
      str = str.replace(/,/g, '');
    } else if (lastComma !== -1) {
      // e.g. 123,45 -> 123.45 (Only comma exists)
      str = str.replace(',', '.');
    }
    // Remove anything that isn't a digit or a dot
    str = str.replace(/[^\d.]/g, '');
    return Math.abs(Number(str) || 0);
  };

  const parseDateFallback = (d: any): string => {
    const fallbackDate = new Date().toISOString().split('T')[0];
    if (!d) return fallbackDate;
    const str = String(d).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
    const match = str.match(/(\d{1,2})[\.\-\/](\d{1,2})(?:[\.\-\/](\d{2,4}))?/);
    if (match) {
      const day = match[1].padStart(2, '0');
      const month = match[2].padStart(2, '0');
      let year = match[3];
      if (!year) year = String(currentYear);
      else if (year.length === 2) year = `20${year}`;
      return `${year}-${month}-${day}`;
    }
    return fallbackDate;
  };

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const prompt = `Analysiere diesen Kontoauszug oder Beleg. Extrahiere alle finanziellen Transaktionen (Einnahmen und Ausgaben).
WICHTIG: Alle Daten müssen erfasst werden, auch wenn das Foto oder Dokument verzerrt, schlecht beleuchtet oder schwer lesbar ist.
Achte besonders auf komplexe Tabellenstrukturen: Oft sind Zeilen über mehrere Textblöcke verteilt. Beträge für Einnahmen (Haben) und Ausgaben (Soll) können in separaten Spalten stehen. Kombiniere zusammengehörige Felder einer Buchung.
Für 'description', extrahiere primär den Händler, Zahlungsempfänger oder Sender (z.B. 'REWE', 'Amazon', oder den Namen einer Person) anstatt irrelevanter Nummernreihen.

FALLBACK MECHANISMEN FÜR SCHLECHT LESBARE DOKUMENTE:
- Nutze den Kontext benachbarter Blöcke: Steht das Datum isoliert darüber, ordne es der darunterliegenden Buchung zu.
- Unvollständige oder umbrochene Sätze: Führe gesplittete Händlernamen logisch zusammen.
- Datum: Identifiziere Formate wie "15.08." oder "15/08" und verknüpfe sie. Achte auf Wertstellung vs. Buchungstag (nimm bevorzugt den Buchungstag).

WICHTIG FÜR BETRÄGE & ZAHLEN:
- Beträge können auf verschiedene Arten formatiert sein: 1.234,56 (DE) oder 1,234.56 (US). Erkenne das Muster des Dokuments.
- Berücksichtige "S" (Soll/Ausgabe) und "H" (Haben/Einnahme) Marker, fehlende Vorzeichen bei getrennten Haben/Soll-Spalten, oder rote Schrift als Ausgabe-Indizien.
- Entferne ALLE Währungssymbole. Wandle alle Beträge für die JSON Ausgabe in POSITIVE, REINE DEZIMALZAHLEN MIT PUNKT um (z.B. "1234.56").

Zeige dem Nutzer eine Meldung (isReadable: false), wenn überhaupt keine Struktur erkennbar ist.

Antworte AUSSCHLIESSLICH als JSON-Objekt mit folgender Struktur:
{
  "isReadable": true|false,
  "statementMonth": "Monat des Kontoauszugs im Format YYYY-MM (falls erkennbar, sonst null)",
  "openingBalance": "Kontostand am Anfang (als reine Dezimalzahl mit Punkt, ohne Währungssymbol, z.B. 1200.50, oder null)",
  "closingBalance": "Kontostand am Ende (als reine Dezimalzahl mit Punkt, ohne Währungssymbol, z.B. 850.20, oder null)",
  "transactions": [
    {
      "date": "Datum (YYYY-MM-DD, Jahr ergänzen falls nötig zu ${currentYear})",
      "description": "Händler, Zahlungsempfänger oder Verwendungszweck (möglichst präzise und bereinigt)",
      "amount": "Betrag als absolute, positive Dezimalzahl (NUR Ziffern und Punkt, KEINE Tausendertrennzeichen, z.B. 45.20)",
      "type": "income" (Einnahme/Gutschrift) oder "expense" (Ausgabe/Belastung),
      "category": "EINE der Kategorien: Wohnen, Essen & Trinken, Freizeit & Shopping, Transport, Abos & Verträge, Sonstiges",
      "reference": "Buchungsnummer, Mandatsreferenz oder ein aussagekräftiger Teil des Verwendungszwecks zur Vermeidung von Duplikaten"
    }
  ]
}`;

  let retries = 0;
  const maxRetries = 3;
  let lastError: any = null;

  while (retries < maxRetries) {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-1.5-flash",
        contents: [
          { text: prompt },
          { inlineData: { mimeType: file.type, data: base64String } }
        ],
        config: {
          responseMimeType: "application/json",
        }
      });

      const jsonText = response.text;
      if (!jsonText) throw new Error("Keine Antwort von der KI erhalten.");
      
      const parsedData = JSON.parse(jsonText);
      
      let extracted = [];
      if (Array.isArray(parsedData)) {
        extracted = parsedData;
      } else {
        if (parsedData.isReadable === false) {
          return { isReadable: false, transactions: [], openingBalance: null, closingBalance: null, statementMonth: null };
        }
        extracted = parsedData.transactions || [];
      }

      const transactions = extracted.map((item: any) => ({
        date: parseDateFallback(item.date),
        description: item.description || "Unbekannte Transaktion",
        amount: parseAmount(item.amount),
        type: item.type === "income" ? "income" : "expense",
        category: item.category || "Sonstiges",
        reference: String(item.reference || "")
      }));

      return {
        isReadable: true,
        transactions,
        openingBalance: parsedData.openingBalance ? parseAmount(parsedData.openingBalance) : null,
        closingBalance: parsedData.closingBalance ? parseAmount(parsedData.closingBalance) : null,
        statementMonth: parsedData.statementMonth || null
      };

    } catch (error: any) {
      lastError = error;
      const isQuotaError = error?.status === 429 || 
                          error?.status === 'RESOURCE_EXHAUSTED' || 
                          error?.message?.includes('429') || 
                          error?.message?.includes('RESOURCE_EXHAUSTED') || 
                          error?.message?.includes('Quota') || 
                          error?.message?.includes('quota');

      if (isQuotaError && retries < maxRetries - 1) {
        retries++;
        const waitTime = Math.pow(2, retries) * 1000 + Math.random() * 1000;
        console.warn(`Quota hit, retrying in ${Math.round(waitTime)}ms... (Attempt ${retries}/${maxRetries})`);
        await sleep(waitTime);
        continue;
      }
      
      console.error("OCR Error:", error);
      if (isQuotaError) {
        throw new Error("Das API-Kontingent (Quota) wurde überschritten. Bitte kurz warten oder am nächsten Tag erneut versuchen (das Free-Tier-Limit wurde erreicht).");
      }
      throw error;
    }
  }
  throw lastError;
}
