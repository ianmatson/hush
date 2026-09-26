// The app is an SPA: signed-in data only, rendered in the browser. Its paths reach the app shell
// (build/app.html) through the rewrites in static/_redirects.
export const ssr = false;
export const prerender = false;
