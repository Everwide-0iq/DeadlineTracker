# Fireboard Brand

Two generated concepts are preserved here: `flame-spark.png` (selected) and `flame-ribbon.png` (alternative). The selected mark pairs a coral flame with a cyan spark, matching the application's accent colors without the fine dashboard details of the old icon.

Run `powershell -File scripts/build-brand-icons.ps1` on Windows to generate the favicon, mobile icons, maskable icon and Telegram JPEG. Generated runtime files are committed in `public/brand`; the build does not require PowerShell or an image library on Vercel.

The React `BrandIcon` component shares the same artwork across branded headers. Functional status icons remain Lucide icons. The web manifest defines home-screen branding, not offline support.

Bot avatar: run `node scripts/brand-telegram.mjs` with `TELEGRAM_BOT_TOKEN` and `TELEGRAM_BOT_USERNAME` in the process environment. Never put credentials in arguments, frontend variables, source files or screenshots.
