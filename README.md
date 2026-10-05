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
  (`social`, `campaign`, `brand`, `content` or `web`; this drives the filter buttons; use several separated by a space, e.g. `campaign content`, to list the card under more than one filter. The first one sets the card's label), add its
  `title` / `desc` / `meta` strings (channel · deliverables) to both languages in `script.js`, and register
  its gallery images in the `galleries` object. Put the piece shown on the cover first in the gallery so the
  lightbox opens on it. The "projects" stat counts cards automatically.
- **Covers** are 960×720 (4:3) JPGs named `*-cover.jpg`. Design work is shown whole, 2–3 pieces of the
  series on a backdrop in the client's color; photography is a full-bleed 4:3 crop.
- **New video:** copy a `.video-card`; the "videos" stat counts them automatically.
