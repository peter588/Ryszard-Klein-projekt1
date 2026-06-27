export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, email, message } = req.body;

  if (!name || !email || !message) {
    return res.status(400).json({ error: 'Wypełnij wszystkie pola.' });
  }

  try {
    const contactRecipient = process.env.CONTACT_NOTIFICATION_EMAIL || 'cisza.umyslu@gmail.com';
    // TODO: skonfigurować zweryfikowaną domenę nadawcy w Resend zamiast onboarding@resend.dev.
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Formularz kontaktowy <onboarding@resend.dev>',
        to: contactRecipient,
        reply_to: email,
        subject: `Wiadomość od ${name}`,
        text: `Imię i nazwisko: ${name}\nE-mail: ${email}\n\n${message}`,
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      console.error('Resend error:', err);
      return res.status(500).json({ error: 'Błąd wysyłki. Spróbuj ponownie.' });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Unexpected error:', err);
    return res.status(500).json({ error: 'Błąd serwera. Spróbuj ponownie.' });
  }
}
