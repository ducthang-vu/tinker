# Hosting a Tinker app

A Tinker app is a static site: one `index.html` and the built files. Its router reads
the URL itself, so a link such as `/tinker/api` or `/todos/3` has no file of its own.
A static host must therefore serve the app for every path that is not a file.

## The rule

For a path with no file, the host serves `index.html` with status 200. The router then
reads the URL, and shows the page for it. The app's base folder comes from the page's
`<base>` element, which the build writes, so the rule applies under that folder too.

If the host returns its own 404 page instead, the app never loads, and every deep link
(a link opened directly, or reloaded) fails. Links inside the app still work, because
they change the URL without a request.

## Setup per host

- **GitHub Pages.** Pages serves `404.html` for a path with no file. Copy `index.html` to
  `404.html` after the build. This repository's `gh-pages` workflow does exactly that.
- **Netlify.** Add a `_redirects` file to the published folder:

  ```
  /*  /index.html  200
  ```

- **nginx.** In the `location` block that serves the app:

  ```
  location / {
      try_files $uri /index.html;
  }
  ```

- **S3 with CloudFront.** Add a custom error response that maps 404 to `/index.html` with
  status 200.

## Hash routing

Angular offers hash routing (`/#/api`), which needs no server rule, because the host never
sees the path. Tinker does not offer it yet: its router reads the browser's history only.
Until it does, the host must serve `index.html` as above.

## Checking a setup

Open a deep link in a new tab, for example `/api`. The app should load and show that page.
If the host's own 404 page appears instead, the rule is missing.
