# Scroll

One random ESV verse per swipe, TikTok style. Tap a verse to see the surrounding verses,
the ESV section heading, and links to free study sources for that chapter.

## How it works
- `index.html`, `style.css`, `app.js`: the web app (no build step).
- `books.js`: verse counts for every chapter (31,104 verses), used to pick verses.
- `api/passage.js`: a Vercel serverless function that calls the ESV API, so the key stays secret.
- The shuffled order and your position are saved on your phone. ESV text is only held in memory,
  because Crossway's terms limit locally stored text to 500 verses.

## Deploy (free)
1. Get a free key at https://api.esv.org (non-commercial use).
2. Import this folder into Vercel (Hobby plan) and set the environment variable `ESV_API_KEY`.
3. Open the site on your iPhone in Safari, tap Share, then "Add to Home Screen".
