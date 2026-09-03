/**
 * What we ask about how the site is used, and nothing else.
 *
 * Every event here answers a question we actually have -- did anyone get past
 * landing, does search lead to a pick, does anyone share -- because an event
 * nobody reads is just data about strangers we chose to collect. There is no
 * identifier of any kind in a payload: a chain slug and a count of items is
 * the whole vocabulary, and the privacy page says so in those terms.
 *
 * Everything no-ops when the tracker is absent, which is the normal state in
 * development, when NEXT_PUBLIC_UMAMI_ID is unset, and whenever a blocker gets
 * through anyway. A missing tracker must never be a broken page.
 */

/** The events the site sends. Adding one here is the only way to send one. */
export type EventName =
  /** The first pick on a page: the one funnel step that matters, since the
   *  question behind all of this is whether people build anything at all. */
  | "meal-started"
  /** Opened the full nutrition label. */
  | "label-opened"
  /** Copied or shared the meal link. */
  | "share-copied"
  /** Opened whole-menu search. */
  | "search-opened"
  /** Picked something FROM a search result, not from the accordions. Paired
   *  with search-opened this says whether search actually answers anything. */
  | "search-picked"
  /** Took the offered last order rather than starting cold. */
  | "last-order-loaded"
  /** Opened the difference table on a comparison page. */
  | "compare-opened";

/** Event payload: small, non-identifying, and never free text from a user. */
export type EventData = Record<string, string | number>;

declare global {
  interface Window {
    umami?: {
      track: {
        (name: string, data?: EventData): void;
        /** The function form, which merges into the default pageview payload.
         *  The only way to send a pageview for a URL other than the real one. */
        (fn: (props: Record<string, unknown>) => Record<string, unknown>): void;
      };
    };
  }
}

export function track(name: EventName, data?: EventData): void {
  try {
    window.umami?.track(name, data);
  } catch {
    /* analytics may never break a page */
  }
}

/**
 * A pageview for `path`, with the query string deliberately discarded.
 *
 * The builder mirrors the whole meal into ?m=, so the real URL is a record of
 * what someone built. Sending it would contradict the promise on the privacy
 * page -- and it would shred the dashboard, since every ingredient tap makes a
 * distinct URL and "top pages" would become a list of thousands of meals seen
 * once each. The function form of umami.track is what allows overriding the
 * URL rather than letting the tracker read location itself.
 */
export function pageview(path: string): void {
  try {
    window.umami?.track((props) => ({ ...props, url: path }));
  } catch {
    /* analytics may never break a page */
  }
}
