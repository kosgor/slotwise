// Not in table-navigation.tsx: that module is "use client", and a server page importing a plain
// value from it gets a client reference instead of the string.

/**
 * For a page that is just a heading and one table: on wide screens the page is exactly as tall as
 * the window (100dvh minus the admin header, 64px + 1px border, and the layout's 2 × 40px padding),
 * so there is no page scroll and the table box (`fit`) takes the rest. Narrower screens scroll the
 * page as usual: the sidebar sits above the content there and the controls wrap.
 */
export const TABLE_PAGE_FIT = "lg:h-[calc(100dvh-145px)]";
