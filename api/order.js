const ORDER_PRODUCT_CATALOG = {
  'cisza-druk-pl': { title: 'Cisza. Esencja naszego umysłu', variant: 'druk PL', price: 50, format: 'druk' },
  'cisza-druk-es': { title: 'Cisza. Esencja naszego umysłu', variant: 'druk ES', price: 95, format: 'druk' },
  'cisza-ebook-pl': { title: 'Cisza. Esencja naszego umysłu', variant: 'e-book PL', price: 30, format: 'ebook' },
  'cisza-ebook-es': { title: 'Cisza. Esencja naszego umysłu', variant: 'e-book ES', price: 60, format: 'ebook' },
  'jamjest-ebook-pl': { title: 'Jam Jest', variant: 'e-book PL', price: 30, format: 'ebook' },
  'jamjest-ebook-en': { title: 'Jam Jest', variant: 'e-book EN', price: 30, format: 'ebook' },
  'sciezki-druk-pl': { title: 'Ścieżki spełnionego życia', variant: 'druk PL', price: 50, format: 'druk' },
  'sciezki-ebook-pl': { title: 'Ścieżki spełnionego życia', variant: 'e-book PL', price: 30, format: 'ebook' },
};

const SHIPPING_PRINT = 20;
const BANK_ACCOUNT_NUMBER = process.env.BANK_ACCOUNT_NUMBER || '51 1140 2004 0000 3902 5119 5054';
const BANK_ACCOUNT_OWNER = process.env.BANK_ACCOUNT_OWNER || 'Ryszard Klein';
const ORDER_NOTIFICATION_EMAIL = process.env.ORDER_NOTIFICATION_EMAIL || 'cisza.umyslu@gmail.com';
const ORDER_REPLY_FROM = process.env.ORDER_REPLY_FROM || 'Zamówienie książek <onboarding@resend.dev>';
// TODO: skonfigurować zweryfikowaną domenę nadawcy w Resend zamiast onboarding@resend.dev.

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function formatPrice(value) {
  return `${value.toFixed(2).replace('.', ',')} zł`;
}

function generateOrderId() {
  const now = new Date();
  const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const time = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
  const random = Math.floor(1000 + Math.random() * 9000);
  return `RK-${date}-${time}-${random}`;
}

function normalizePayload(body) {
  return {
    customer: body?.customer || {},
    shipping: body?.shipping || {},
    items: Array.isArray(body?.items) ? body.items : [],
    consent: body?.consent || {},
    note: typeof body?.note === 'string' ? body.note.trim() : '',
  };
}

function validatePayload(payload) {
  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    return 'Koszyk zamówienia nie może być pusty.';
  }
  if (!isNonEmptyString(payload.customer.fullName)) return 'Brak imienia i nazwiska.';
  if (!isNonEmptyString(payload.customer.email)) return 'Brak adresu e-mail.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.customer.email.trim())) return 'Niepoprawny adres e-mail.';
  if (!isNonEmptyString(payload.shipping.street)) return 'Brak ulicy i numeru.';
  if (!isNonEmptyString(payload.shipping.postalCode)) return 'Brak kodu pocztowego.';
  if (!isNonEmptyString(payload.shipping.city)) return 'Brak miejscowości.';
  if (!isNonEmptyString(payload.shipping.country)) return 'Brak kraju.';
  if (payload.consent.acceptTransfer !== true) return 'Brak akceptacji warunku płatności.';
  if (payload.consent.acceptPrivacy !== true) return 'Brak zgody na przetwarzanie danych.';
  return null;
}

function recalculateItems(rawItems) {
  const items = rawItems.map((item) => {
    const catalogEntry = ORDER_PRODUCT_CATALOG[item?.id];
    const quantity = Number(item?.quantity);
    if (!catalogEntry) throw new Error(`Nieznana pozycja zamówienia: ${item?.id || 'brak id'}`);
    if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 99) {
      throw new Error(`Niepoprawna ilość dla pozycji: ${catalogEntry.title}`);
    }

    return {
      id: item.id,
      title: catalogEntry.title,
      variant: catalogEntry.variant,
      format: catalogEntry.format,
      quantity,
      unitPrice: catalogEntry.price,
      lineTotal: catalogEntry.price * quantity,
    };
  });

  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
  const shipping = items.some((item) => item.format === 'druk') ? SHIPPING_PRINT : 0;
  return { items, subtotal, shipping, total: subtotal + shipping };
}

async function sendResendEmail(payload) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.message || 'Błąd wysyłki przez Resend.');
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.RESEND_API_KEY) {
    return res.status(500).json({ error: 'Brak konfiguracji wysyłki e-mail.' });
  }

  try {
    const payload = normalizePayload(req.body);
    const validationError = validatePayload(payload);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const totals = recalculateItems(payload.items);
    const orderId = generateOrderId();
    const orderDate = new Date().toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'medium' });
    const transferTitle = `${orderId} ${payload.customer.fullName}`;

    const authorText = [
      `Nowe zamówienie książek — ${orderId}`,
      '',
      `Data: ${orderDate}`,
      '',
      'Dane klienta:',
      `Imię i nazwisko: ${payload.customer.fullName}`,
      `E-mail: ${payload.customer.email}`,
      `Telefon: ${payload.customer.phone || '—'}`,
      '',
      'Adres wysyłki:',
      payload.shipping.street,
      `${payload.shipping.postalCode} ${payload.shipping.city}`,
      payload.shipping.country,
      '',
      'Zamówione pozycje:',
      ...totals.items.map((item) => `- ${item.title} / ${item.variant} / ilość: ${item.quantity} / cena: ${formatPrice(item.unitPrice)} / razem: ${formatPrice(item.lineTotal)}`),
      '',
      `Suma produktów: ${formatPrice(totals.subtotal)}`,
      `Koszt wysyłki: ${formatPrice(totals.shipping)}`,
      `Suma do zapłaty: ${formatPrice(totals.total)}`,
      '',
      `Uwagi klienta: ${payload.note || '—'}`,
      '',
      'Wyślij po zaksięgowaniu płatności.',
    ].join('\n');

    const customerText = [
      `Dziękujemy za zamówienie książek bezpośrednio u autora.`,
      '',
      `Numer zamówienia: ${orderId}`,
      '',
      'Zamówione pozycje:',
      ...totals.items.map((item) => `- ${item.title} / ${item.variant} / ilość: ${item.quantity} / razem: ${formatPrice(item.lineTotal)}`),
      '',
      `Suma produktów: ${formatPrice(totals.subtotal)}`,
      `Koszt wysyłki: ${formatPrice(totals.shipping)}`,
      `Łącznie do zapłaty: ${formatPrice(totals.total)}`,
      '',
      `Numer konta: ${BANK_ACCOUNT_NUMBER}`,
      `Odbiorca: ${BANK_ACCOUNT_OWNER}`,
      `Tytuł przelewu: ${transferTitle}`,
      '',
      'Wysyłka nastąpi po zaksięgowaniu płatności.',
      'W razie pytań prosimy o kontakt: cisza.umyslu@gmail.com',
    ].join('\n');

    await sendResendEmail({
      from: ORDER_REPLY_FROM,
      to: ORDER_NOTIFICATION_EMAIL,
      reply_to: payload.customer.email,
      subject: `Nowe zamówienie książek — ${orderId}`,
      text: authorText,
    });

    await sendResendEmail({
      from: ORDER_REPLY_FROM,
      to: payload.customer.email,
      subject: 'Potwierdzenie zamówienia książek — Ryszard Klein',
      text: customerText,
    });

    return res.status(200).json({
      ok: true,
      orderId,
      totalAmount: totals.total,
      bankAccount: BANK_ACCOUNT_NUMBER,
      transferTitle,
    });
  } catch (error) {
    console.error('Order error:', error);
    return res.status(500).json({ error: error.message || 'Nie udało się wysłać zamówienia.' });
  }
}
