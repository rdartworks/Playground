# Brand assets

`logo.svg` is a **placeholder**. To brand the app:

1. Get the official logo file from your organisation's brand portal (SVG preferred; PNG works too).
2. Save it here as `logo.svg`, replacing the placeholder.
   - Using a PNG instead? Save it as `logo.png` and change `/brand/logo.svg` to `/brand/logo.png` in
     `public/index.html` and in `LOGO_SRC` at the top of `public/js/app.js`.
3. Refresh the browser.

The logo appears in the header and on the cover of every proposal. In dark mode the header logo is
shown in white automatically, so use a single-colour logo for best results.

Theme colours are defined once, at the top of `public/styles.css` (the `:root` blocks).
Only use a company's logo and brand if you're authorised to under its brand guidelines.
