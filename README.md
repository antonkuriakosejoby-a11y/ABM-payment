# ABM Payment Management

A payment website for ABM. The currency is **Ⱥ̶ Aurex**.

## What it does

- **Login with a PIN.** The ABM account also needs an OTP, which is emailed to `antonkuriakose@gmail.com`.
- **Pay.** Enter a phone number or tap a person, enter the amount, choose what it's for (Fees, Salary or Other) and add a message. Then enter your PIN to pay. You get a receipt with a **Take screenshot** button that lets you share or save it. Paying ABM doesn't need an OTP, only the PIN.
- **No balance.** If you try to pay more than you have, the payment is blocked. The ABM account has unlimited money.
- **Check Transactions.** Shows everyone you paid and everyone who paid you, by name. Tap one to see its receipt.
- **Show QR Code.** A QR code for your account. Scanning it opens the Pay screen with you already chosen.
- **Balance.** Members only. You must enter your PIN to see it.
- **Fees.** Each member pays Ⱥ̶ 70,000 to ABM every two months (Jan–Feb, Mar–Apr, …). Members see a reminder until they pay.
- **Message ABM.** Members who can't pay can write to ABM, and ABM can reply.
- **ABM only:**
  - **Fees Status** shows who has paid and who hasn't.
  - **Send reminder for fees** lets you pick who gets a reminder. It stays on their screen for 7 days or until they pay.
  - **Salary** shows a reminder every month until everyone's salary is paid.
  - **Inbox** holds the messages from members.

Until you set up Firebase and EmailJS (below), the site runs in **demo mode**. Data stays in one browser and the OTP is shown on screen.

---

## 1. Firebase (shared live data)

1. Go to <https://console.firebase.google.com> and click **Add project**. Analytics isn't needed.
2. **Build → Firestore Database → Create database.** Pick a location near you and start in **production mode**.
3. On the **Rules** tab, paste the contents of `firestore.rules` and click **Publish**.
4. Go to **Project settings (⚙) → General → Your apps** and click the **Web** `</>` icon to register an app.
5. Copy the `firebaseConfig` values into `config.js` under `firebase`.

## 2. EmailJS (OTP email for the ABM account)

1. Sign up at <https://www.emailjs.com>.
2. **Email Services → Add New Service → Gmail.** Connect your Gmail and copy the **Service ID**.
3. **Email Templates → Create New Template:**
   - **To Email:** `{{to_email}}`
   - **Subject:** `ABM login code`
   - **Content:** `Your ABM Payment Management code is {{otp_code}}. It expires in {{expires_in}}.`
   - Save it and copy the **Template ID**.
4. **Account → General:** copy the **Public Key**.
5. Put the three values into `config.js` under `emailjs`.
6. Optional but recommended: in **Account → Security**, limit EmailJS to your GitHub Pages domain.

## 3. Put it on GitHub Pages

```bash
git remote add origin https://github.com/<your-username>/abm-payment.git
git push -u origin main
```

On GitHub, open the repo and go to **Settings → Pages**. Under Source, choose **Deploy from a branch → `main` / root**. The site goes live at `https://<your-username>.github.io/abm-payment/`.

The QR codes and the screenshot sharing only work once the site is online. They don't work when you open `index.html` straight from your computer.

## Changing a PIN

PINs are stored as SHA-256 hashes of `ABM|<id>|<pin>`. To make a new hash, run this in Git Bash:

```bash
printf 'ABM|joby|1234' | sha256sum
```

Paste the result into `accounts.js` as that person's `pinHash`.

## Security — read this

This is a static website with no server, so everything runs in the browser:

- Someone who knows how could edit balances directly in Firestore, or skip the OTP check. That's fine for a private family or club system, but it isn't safe for real money.
- 4-digit PIN hashes can be guessed by a computer quickly.
- If the GitHub repo is **public**, everyone can see the family photos and phone numbers. Hosting from a private repo needs GitHub Pro. The other option is to keep the repo public and accept that.
