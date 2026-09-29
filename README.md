# Portfolio — Ricardo Villanueva Valdez

Personal portfolio site focused on digital marketing: strategy &amp; analytics, social media, photo/video content, brand design and e-commerce.

Plain HTML/CSS/JS, no build step.

## Run locally

Just open `index.html` in a browser, or serve the folder with any static server.

## Deploy with GitHub Pages

1. Push to `main`.
2. In the repo settings, enable **Pages** → deploy from branch `main`, folder `/ (root)`.
3. The site will be live at `https://ricardovillanueva0399-web.github.io/PORTAFOLIO/`.

## Editing content

- All copy lives in `script.js` (`translations.en` / `translations.es`) and is bound to the markup with `data-i18n`.
- **New project:** copy an `<article class="project">` block in `index.html`, set its `data-topic`
  (`social`, `campaign`, `brand`, `content` or `web`; this drives the filter buttons), and register its
  gallery images in the `galleries` object in `script.js`. The "projects" stat counts them automatically.
- **New video:** copy a `.video-card`; the "videos" stat counts them automatically.
