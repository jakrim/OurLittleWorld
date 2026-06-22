# Our Little World website

This folder is the deployable marketing website for `ourlittleworld.me`.

It intentionally lives next to the Expo mobile app instead of inside `app/` or `src/`:

- the public site can be deployed as a static folder on GoDaddy or any static host;
- the mobile app keeps its Expo Router structure unchanged;
- brand assets are copied into `website/assets/` so this folder is self-contained for hosting.

## Local preview

From the repo root:

```sh
python3 -m http.server 4173 --directory website
```

Then open `http://localhost:4173`.

## Routes

- `/`
- `/story/`
- `/pricing/`
- `/gift/`
- `/partners/`
- `/privacy/`

`Begin Chapter One` points to `/pricing/#chapter-one`.
`Purchase for a friend` points to `/gift/`.
