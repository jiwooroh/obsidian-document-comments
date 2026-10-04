# Changelog

All notable changes to **Document Comments**. The release workflow uses the section
matching the pushed tag as that GitHub release's notes, so add an entry here before tagging.

## Unreleased

## 0.2.9

- Removed the **Show floating button** setting and its selection button. Add comments with the **Add comment** command, or the **Comment** button in [Notion Selection Toolbar](https://github.com/jiwooroh/notion-selection-toolbar).

## 0.2.8

- **Profile photo:** pick an image from your vault (or paste an image link) in settings, and it shows small and round next to your name on your own comments and replies. Turn off **Show my profile** to hide your name and photo on your comments.
- **Long comments show in full** in the margin when there's room. A long comment folds to a "more" preview only when it would run into the next card (or is too tall for the window), or when you fold it yourself with the new **less** link. Your "more" / "less" choice stays until you click the other.

## 0.2.7

- **iPad:** comment cards now show in the right margin on tablets, like on desktop. Only phones skip the margin and use the sidebar and a pop-up for new comments.

## 0.2.6

- **Show author names** setting: turn it off to hide who wrote each comment and reply, on comment cards and in highlight hover previews. On by default.

## 0.2.5

- **Highlight colors** updated to Notion's current palette: background variants as the fill and bold text variants as the tone, in light and dark mode. **Highlight intensity** still mixes the tone into the fill (0% = Notion's exact color).

## 0.2.4

- **Custom highlight colors** settings now show each color's default for its own theme (Notion's light palette in the light rows, dark palette in the dark rows) instead of a blank swatch, and **Reset** updates the swatch right away.

## 0.2.3

- **Notion highlight colors:** the 9 highlight colors now use Notion's current palette in light and dark mode (background color as the fill, text color for underlines and colored comment text). Default **Highlight intensity** is now 0%, so highlights match Notion exactly; raise it for bolder colors.

## 0.2.2

- **Annotation style** now has three options: **Highlight** (fill only, no underline), **Underline** (no fill), and **Highlight + underline**. Highlights no longer get an underline unless you choose it, in the editor, Reading view, tables, and PDF export.
- **Comments in PDF export:** exported PDFs highlight each commented passage with a footnote number and print its comment beside it in a right-hand margin column. Toggle it with the new **Show comments in PDF export** setting or the **Toggle comments in PDF export** command.

## 0.2.1

- Renamed the plugin to **Notion-style Comments** (ID `notion-style-comments`) so it can be listed separately from the original Document Comments. The comment format in your notes is unchanged.

## 0.2.0

First release of Lucy's fork, based on the original plugin's 0.1.12 by Kyle McDonald.

- **Text formatting toolbar in comments:** select text in a comment box to apply bold, italic, underline, strikethrough, text color, or highlight.
- **Highlight colors:** theme default or 9 Notion-style colors, an intensity slider, and custom hex values per color for light and dark themes.
- **Annotation style:** mark commented text with a filled highlight or a quiet underline.
- **Per-comment overrides:** change a single comment's color or style from its **⋯** menu.
- **Show floating button** setting: a comment button next to selected text. Also works with [Notion Selection Toolbar](https://github.com/jiwooroh/notion-selection-toolbar)'s **Comment** button.
- **Narrow window layout:** when the margin doesn't fit, cards hide and appear on hover.
- Comment boxes grow as you type, long comments clamp with a "more" link, and clicking your own comment text edits it.

## 0.1.12

- Added an **Allow empty comments** setting. An empty comment highlights its selected text and shows an editable **Empty** card. Run **Add comment** on the same text to add text or delete the comment ([#52](https://github.com/kylemcd/obsidian-document-comments/issues/52)).

## 0.1.11
- **Comments on code blocks** — select one or more lines inside a fenced code block and comment on them. The lines are highlighted in Live Preview and Reading view, and a commented code block lays out exactly like an uncommented one, with no added gap above or below it.
- Fixed a forward-delete (the Del / Fn+Delete key) at the end of a commented line silently destroying the entire comment thread, with nothing appearing to change in the note.
- Fixed multi-line comment text — a reply written with line breaks — becoming corrupted on save, where it could re-parse into a broken entry and a phantom reaction. Line breaks, blank lines, and trailing spaces are now preserved.
- Fixed commenting on text (or signing with an author name) containing `-->`, which could break the stored comment and leak the discussion as visible text in Reading view, on GitHub, and in exports.
- Deleting a comment now removes every copy of its markers, so copy-pasting commented text no longer leaves behind invisible markers that couldn't be removed.
- Comment edits and replies made from the sidebar or Reading view now go through the open editor when the note is open, so they join its undo history and no longer risk clobbering unsaved changes.
- Orphaned comments — a discussion whose highlighted text is no longer present — no longer appear as empty cards in the margin; they remain available in the **All discussions** sidebar ([#43](https://github.com/kylemcd/obsidian-document-comments/issues/43)).

## 0.1.10
- Removed the `text-decoration-color` declarations that Obsidian's community-plugin review groups under the partially supported `text-decoration` browser feature. Open and resolved table comments remain visually distinct through their highlight backgrounds.

## 0.1.9
- Fixed an Obsidian community-plugin review compatibility warning by replacing the extended `text-decoration` shorthand in Live Preview table highlights with supported underline and color declarations. Table comment highlights remain visible in both open and resolved states.

## 0.1.8
- Fixed Live Preview table comments remaining unhighlighted until their cell was focused. Highlights now match Markdown-formatted anchors such as inline code and map mounted table widgets by source position, so they remain correct when CodeMirror virtualizes earlier tables.
- Kept hidden comment markers from appearing or wrapping text in focused table cells while preserving reliable cursor movement across marker boundaries.
- Fixed comments on inline code selections such as `` `Spinner` `` by placing the invisible anchor markers outside the backticks instead of rendering them as literal code.

## 0.1.7
- Added comment highlights inside Live Preview tables and hover previews for highlighted text. Highlights remain passive when clicked; selecting a comment in the sidebar now scrolls to its text reliably in either direction ([#29](https://github.com/kylemcd/obsidian-document-comments/issues/29)).
- Unified comment creation around the reliable **Add comment** selection command across regular text and tables, while retaining a separate Reading view command.
- Fixed the comment composer appearing behind table rows and other stacking problems in tables ([#28](https://github.com/kylemcd/obsidian-document-comments/issues/28)).
- Fixed cursor pauses and caret-height jumps around inline comment markers, including adjacent punctuation, line boundaries, nested markers, and deletion cases ([#41](https://github.com/kylemcd/obsidian-document-comments/issues/41)).
- Addressed Obsidian community-plugin review warnings by using supported DOM helpers and settings indexing patterns.
- Updated the release toolchain and development dependencies, including TypeScript 7, Vitest 4, typescript-eslint, eslint-plugin-obsidianmd, `@types/node`, and `actions/setup-node`; refreshed transitive dependencies with zero known audit vulnerabilities.

## 0.1.6
- Fixed the inline comment column continuing to reserve its ~320px of margin over empty space once every comment on a note was resolved (with "Show resolved" off). The column is now reserved only when a comment's card actually renders, in both Live Preview and Reading view ([#30](https://github.com/kylemcd/obsidian-document-comments/issues/30)).
- Updated development dependencies (oxlint, eslint, typescript-eslint, @types/node, @codemirror/view).

## 0.1.5
- Fixed the document reflowing (shifting left, then re-centering) every time you started or finished a comment. The new-comment composer is a floating overlay and no longer reserves the margin column, so the text stays put — most noticeable when the comments sidebar is open and the inline column isn't shown ([#15](https://github.com/kylemcd/obsidian-document-comments/issues/15)).

## 0.1.4
- **Mobile support** — Document Comments now works on Obsidian mobile. There's no floating margin on phones and tablets; instead the in-text highlights mark commented text and you read, reply, and resolve through the **"All discussions" sidebar**, with new comments composed in a quick dialog. It's the same inline storage, so a note's comments are identical across desktop and mobile.
- Saving a comment now reports a clear reason if it ever fails, instead of occasionally failing silently.

## 0.1.3
- Sidebar: the last comment's reply field is no longer cut off at the bottom — there's room to scroll it up clear of the status bar, with space to grow as you type.

## 0.1.2
- **Markdown in comments** — comment text now renders Markdown (code spans, bold, links, lists) in both the margin and the sidebar.
- **Long comments** collapse to a "Show more" preview; one click opens the full thread *and* the reply box. A thread taller than the screen shows "Open in sidebar" instead (its bottom is unreachable inline).
- **Margin polish** — cards slide off the top edge as you scroll instead of sticking; clicking a card no longer scrolls the document; the reply box reveals and focuses when you open a card; expand/collapse animates smoothly.
- Comment highlights now render inside **tables** in Reading view. (Live Preview can't highlight inside its table widget — a documented limitation.)

## 0.1.1
- Addressed Obsidian community-plugin review feedback.
- Removed every `:has()` and `!important` from the stylesheet (selectors are now scoped to out-specify Obsidian's core rules).
- Replaced the `builtin-modules` build dependency with `node:module`.
- Added a CI release workflow that builds the plugin and attaches **build-provenance attestations** to the release assets.

## 0.1.0
- Initial release — Notion/Linear-style margin comments stored inline in your markdown as HTML comments, with threads, reactions, resolve/reopen, a comments sidebar, and Reading-view support.
