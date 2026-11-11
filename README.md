# GolfRSA Leaderboard Builder

Build 1080×1350 tournament leaderboard graphics in the browser, and keep every downloaded graphic in a shared **download bank** that anyone can browse by tournament and month.

- **Builder** (`index.html`): enter or paste each day's scores, upload the photo and event logo, and download the PNG. Totals, score to par, positions, ties and the round title (ROUND 1 … FINAL ROUND) are worked out automatically, and the card widens as rounds are added.
- **Download bank** (`bank.html`): every download filed from the builder, grouped by month, with a downloads-per-tournament table, filters and full-size downloads.

No login is needed for either page.

---

## 1. Put it on GitHub

1. Create a new repository on GitHub, for example `golfrsa-leaderboard`. It must be **public** for free GitHub Pages hosting.
2. Upload everything in this folder:
   - **On the website:** choose *Add file › Upload files* and drag in the whole folder's contents, keeping the `css`, `js`, `supabase`, `photoshop` and `sample` folders.
   - **With git:** `git remote add origin https://github.com/<you>/golfrsa-leaderboard.git && git push -u origin main`
3. Go to *Settings › Pages*. Under *Build and deployment*, set **Source: Deploy from a branch**, **Branch: main**, **Folder: / (root)**, and click Save.
4. After a minute the site is live at `https://<you>.github.io/golfrsa-leaderboard/`.

The builder works at this point. Downloads save to the person's computer, and the bank shows "not connected" until you complete step 2.

## 2. Connect the download bank (free Supabase project)

1. Sign up at [supabase.com](https://supabase.com) and create a **New project** (the free plan is fine). Pick a region close to South Africa, such as `eu-west` or `af-south` if offered.
2. In the project, open **SQL Editor › New query**, paste the whole of [`supabase/setup.sql`](supabase/setup.sql), and click **Run**. It creates:
   - the `downloads` table
   - the public `leaderboards` storage bucket
   - the access rules
3. Open **Project Settings › API** and copy:
   - the **Project URL**
   - the **anon public** key
4. On GitHub, open `js/config.js`, click the pencil icon, paste both values between the quotes, and commit:

   ```js
   supabaseUrl: "https://abcdefghijkl.supabase.co",
   supabaseAnonKey: "eyJhbGciOi...",
   ```

5. Reload the site. Downloads now go into the bank.

**Is it safe to publish the anon key?** Yes. Supabase designs it to be public. The rules in `setup.sql` only let visitors **add** new downloads and **view** existing ones. Nobody can edit, overwrite or delete anything from the website.

## 3. Day-to-day use

1. Open the builder and fill in **Tournament name**, venue, dates and par. The tournament name is how downloads are grouped in the bank.
2. Paste the field from Excel or Google Sheets, or type the scores in. Add the next round's column each day.
3. Upload the event logo and the photo, and use the sliders to keep the face clear of the card.
4. Click **Download PNG**. The file saves to your computer and, with *File each download in the download bank* ticked, is also added to the bank under the current month.

Scores and images are remembered in that browser. To hand over to a colleague, click **Export CSV** and send the file; they paste it in with *Replace players*. The same CSV works with the Photoshop script in `photoshop/`.

## Managing the bank

- **Remove a graphic:** delete it from Supabase in two places:
  - its row, in *Table Editor › downloads*
  - its files, in *Storage › leaderboards › (month folder)*
- **Storage:** the free plan includes 1 GB, roughly 600–900 leaderboards, since each download is a 1–1.5 MB PNG plus a small thumbnail. Delete old months or upgrade if it fills up.
- **Inactive projects:** Supabase pauses free projects after about a week with no activity. If the bank shows an error after a quiet spell, open the Supabase dashboard and click **Restore**.

## What's in the repo

| Path | What it is |
|---|---|
| `index.html` | The leaderboard builder |
| `bank.html` | The public download bank |
| `css/style.css` | Shared styles (light and dark mode) |
| `js/config.js` | **Your Supabase URL and key go here** |
| `js/builder.js` | Builder logic: scoring, drawing, CSV import/export, downloads |
| `js/bank-client.js` | Talks to Supabase (upload, list, links) |
| `js/bank.js` | Bank page: grouping, filters, gallery |
| `js/footer-logo.js` | GolfRSA footer logo, embedded |
| `supabase/setup.sql` | One-off database and storage setup |
| `photoshop/Build_Leaderboard.jsx` | Photoshop script that builds the same layout as layers from a CSV |
| `sample/Tournament_Scores.csv` | Example scores to paste in |

## Changing the design

The layout values live near the top of the drawing code in `js/builder.js`, in the `L` and `C` objects:
- `scale: 0.9` sets the card size
- `cardOpacity: 0.8` sets the card background opacity
- `C` holds the colours

They match the Photoshop script, so keep both in step if you change one.
